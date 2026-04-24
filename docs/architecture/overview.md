# Architecture Overview

## Context

Chakra Commerce began as a Java EE monolith deployed on bare metal, processing orders, managing inventory, and handling customer accounts within a single deployable. Over time the monolith accumulated:

- Shared database tables read and written by every domain
- Deployment coupling: a customer-facing fix required a full monolith release
- Test suite runtime measured in hours
- SLA accountability that was platform-wide — no service owned its own number

The modernization goal is not to rewrite the monolith. It is to *extract bounded contexts from it* one at a time, while the monolith continues to serve traffic. Each extraction makes the system incrementally more observable, independently deployable, and accountable to a specific SLA.

---

## Target Architecture

Four bounded contexts, each as an independent service:

**Customers** — Registration, address management, account suspension. The simplest context and the lowest-risk extraction. No upstream dependencies on Orders or Inventory at the service boundary.

**Inventory** — Stock levels, reservation, release. CQRS: writes go to PostgreSQL; a Redis projection serves sub-10ms stock level reads. This is the first context with a meaningful read/write performance split that justifies the pattern.

**Orders** — Order lifecycle from placement through confirmation or cancellation. Event-sourced: every state transition is an immutable event. Saga orchestration coordinates with Inventory (reserve stock) and Payment Gateway (charge card). The most complex context; extracted last.

**Platform** — Not a business domain, but a first-class concern: the Kafka event bus, OTEL pipeline, API gateway (Kong), and Kubernetes platform primitives. Platform SLAs underpin every service SLA.

---

## Core Patterns Applied

### Strangler Fig Migration
The Kong API gateway is deployed as a facade in front of the monolith on day one. Traffic is routed by URL path prefix. As each bounded context is extracted, its paths are re-routed from the monolith to the new service. The monolith shrinks; it is never rewritten. See [`docs/migration/strategy.md`](../migration/strategy.md).

### Domain-Driven Design
Bounded contexts are identified through event storming and encoded in the ubiquitous language documents in [`docs/ddd/`](../ddd/). Team ownership follows context boundaries, not technical layer boundaries (see `CODEOWNERS`).

### Event Sourcing (Orders)
The Orders domain uses EventStoreDB as its system of record. Every command that changes an Order appends an event; the current state is reconstructed by replaying the stream. This gives a full audit trail and enables saga compensation by replaying events in a test context before committing. See [ADR-0006](../adrs/ADR-0006-event-sourcing-orders.md).

### CQRS (Inventory)
Inventory has a 10:1 read-to-write ratio for stock level queries. The write model (PostgreSQL) handles reservations with strong consistency. A Kafka consumer maintains a Redis projection for reads. The two models diverge by at most one Kafka consumer lag interval (target: < 100ms). See [ADR-0007](../adrs/ADR-0007-cqrs-inventory.md).

### Saga Orchestration (place-order flow)
The Orders service orchestrates a distributed transaction across Inventory and Payment:
1. Reserve stock (Inventory)
2. Capture payment (Payment Gateway)
3. Confirm order (Orders event store)

If step 2 fails, a compensation event releases the stock reservation. See the [sequence diagram](diagrams/sequence-place-order.md) and [saga compensation diagram](diagrams/sequence-saga-compensation.md).

### Choreography vs. Saga Orchestration
The system uses both coordination models. **Saga Orchestration** (place-order flow) is used when the distributed transaction must be compensated if a step fails — the Orders service issues commands, waits for outcomes, and triggers compensation on failure. **Choreography** is used when downstream reactions are independent and failure does not require the originating service to act — Orders publishes `OrderConfirmed` and is done. The Fulfillment Gateway, Inventory cache warming, and future analytics consumers all react independently.

The decision rule: if the originating service needs to know the outcome, use orchestration. If it doesn't care, use choreography. See [ADR-0015](../adrs/ADR-0015-choreography-events.md) for the full decision criteria and the [choreography sequence diagram](diagrams/sequence-choreography.md).

### Leave-and-Layer (Fulfillment Gateway)
The on-premises Warehouse Management System (WMS) is a vendor product that cannot be modified. Rather than attempting a parallel replacement while extracting the Orders bounded context, we apply the Leave-and-Layer pattern: the WMS is left in place, and a **Fulfillment Gateway** service is deployed as a new asynchronous layer between the event bus and the WMS SOAP API.

The gateway subscribes to `OrderConfirmed` events on Kafka and translates them into WMS dispatch requests. The Orders service has no knowledge of the WMS; it publishes a domain event and is done. The WMS is untouched. When a modern Fulfillment service is eventually built, only the Kafka consumer group is transferred — no changes required in Orders, Inventory, or Customers.

This pattern is distinct from Strangler Fig. Strangler Fig routes traffic to a new service, gradually replacing the old one. Leave-and-Layer accepts the old system as a permanent (or long-lived) dependency and adapts to it. See [ADR-0011](../adrs/ADR-0011-leave-and-layer-warehouse.md).

### SLO-Based Observability
SLAs defined in `contracts/slas/` are the source of truth. SLO definitions in `observability/slos/` translate them into Prometheus-queryable windows. Alerts use multi-window burn rate (Google SRE model) so on-call is paged proportional to budget consumption velocity, not raw error rate. See the [SLA measurement flow](diagrams/sla-measurement-flow.md).

---

## Cross-Cutting Concerns

### Sidecar Pattern
Cross-cutting infrastructure concerns — mTLS, traffic policy enforcement, and telemetry collection — are handled by two sidecars injected into every pod, not by application code. The **Envoy** sidecar (via Istio) provides mTLS with SPIFFE identities, enforces DestinationRule traffic policies (circuit breaking, connection pool limits), and propagates distributed trace context. The **OTEL Collector** sidecar (via the OTEL Operator) receives OTLP signals from the application SDK and forwards them to the Grafana stack. Service authors write business logic and instrument with the OTEL SDK; they implement no TLS code, no retry logic, and no metrics export configuration. See [ADR-0014](../adrs/ADR-0014-sidecar-mesh.md).

### Bulkhead Isolation
Failures in one bounded context are prevented from cascading by two isolation layers. **Namespace-level ResourceQuotas** cap the total CPU and memory each context can consume across all its replicas — a Fulfillment Gateway memory leak cannot evict Orders pods. **Connection pool limits** in each service's Istio DestinationRule create per-downstream pool boundaries — a degraded Payment Gateway cannot exhaust the Orders service's shared outbound connection pool. See [ADR-0013](../adrs/ADR-0013-bulkhead-isolation.md).

### Authentication and Authorization
Kong handles inbound authentication (JWT validation at the gateway). Service-to-service calls within the cluster use Istio mTLS with SPIFFE identities. No service trusts a caller based on network location alone.

### Secrets Management
No secrets in Git. AWS Secrets Manager is the store; the External Secrets Operator syncs secrets into Kubernetes `Secret` objects at pod startup. Rotation is handled by Secrets Manager; pods pick up new values on next restart or via volume mount refresh.

### Network Policy
All namespaces default to deny-all (see `infrastructure/kubernetes/policies/network-default-deny.yaml`). Every allowed path is an explicit `NetworkPolicy` rule in the Helm chart template for that service.

### Observability
Three pillars via a single pipeline: OpenTelemetry SDK in each service → OTEL Collector → Grafana stack (Tempo for traces, Loki for logs, Mimir for metrics). The OTEL Operator auto-injects agents into all `chakra-*` namespaces. Custom business metrics (order throughput, stock reservation rate) are registered in `OtelInstrumentation.ts` per service.

---

## Diagrams

| Diagram | What it shows |
|---|---|
| [System Context](diagrams/system-context.md) | Chakra Commerce and its external actors |
| [Container](diagrams/container.md) | All services, data stores, and message bus |
| [SLA Measurement Flow](diagrams/sla-measurement-flow.md) | How contracts become runtime alerts and dashboards |
| [Place Order Sequence](diagrams/sequence-place-order.md) | End-to-end saga for a successful order |
| [Saga Compensation](diagrams/sequence-saga-compensation.md) | Rollback when payment fails mid-saga |
| [Event Catalog](diagrams/event-catalog.md) | All domain events, schemas, and owners |
