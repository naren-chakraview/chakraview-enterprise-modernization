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

### SLO-Based Observability
SLAs defined in `contracts/slas/` are the source of truth. SLO definitions in `observability/slos/` translate them into Prometheus-queryable windows. Alerts use multi-window burn rate (Google SRE model) so on-call is paged proportional to budget consumption velocity, not raw error rate. See the [SLA measurement flow](diagrams/sla-measurement-flow.md).

---

## Cross-Cutting Concerns

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
