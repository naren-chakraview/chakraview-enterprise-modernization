# Glossary

Shared language across all bounded contexts, the platform team, and product stakeholders. When a term appears in an ADR, domain model, or event schema, it means exactly what is defined here — not what a reader assumes from general industry usage.

---

## Business Terms

**Order** — A customer's intent to purchase one or more products. An Order has a lifecycle (Pending → Confirmed → Cancelled) and is the root aggregate of the Orders bounded context. An Order is not the same as a fulfillment; it ends when payment is captured and an `OrderConfirmed` event is published.

**Reservation** — A temporary hold on stock quantity for a specific Order. A Reservation prevents another Order from claiming the same stock. Reservations expire if the Order is not confirmed within the reservation TTL (default: 15 minutes).

**Stock Level** — The quantity of a SKU available for new reservations. Equals on-hand quantity minus active reservation quantity. The authoritative stock level lives in the Inventory write model; the Redis projection is eventually consistent.

**Customer** — A registered entity that places Orders. A Customer is not a user session; authentication identities are separate from the Customer aggregate. A Customer may have multiple addresses and may be suspended.

**Suspension** — A Customer account state that prevents new Order placement. Suspension is triggered by risk systems or operators. It does not cancel existing open Orders.

**SKU** — Stock Keeping Unit. The atomic unit of inventory. An Order contains one or more Order Items, each referencing a SKU.

**Error Budget** — The inverse of an SLA availability target, expressed as allowable downtime or failure volume over a rolling window. Example: 99.95% availability over 30 days = 21.6 minutes of allowed downtime. Error budgets are tracked in real time via burn rate alerts.

---

## Technical Terms

**Aggregate** — A cluster of domain objects (entities + value objects) treated as a single unit for data changes. All mutations go through the aggregate root. No external object holds a reference to a non-root member of the aggregate.

**Domain Event** — An immutable record that something significant happened in the domain. Named in the past tense (OrderPlaced, StockReserved). The canonical schema lives in `contracts/event-schemas/`. Events are the integration currency between bounded contexts.

**Command** — A request to change state. Commands can be rejected (business rule violation). A successful command produces one or more domain events. Commands are named in the imperative (PlaceOrder, ReserveStock).

**Saga** — A sequence of local transactions coordinated across multiple services. Each step can succeed or fail. On failure, compensation steps run in reverse order. The Orders service orchestrates the place-order saga; Inventory and Payment participate.

**Bounded Context** — A semantic boundary within which a model is consistent and the ubiquitous language applies. A term that means one thing inside one context may mean something different inside another. Integration across context boundaries goes through published events or versioned APIs.

**Strangler Fig** — A migration pattern where a new system grows around the old system, routing traffic away from it gradually, until the old system can be decommissioned. Named after the strangler fig tree that grows around a host.

**SLO (Service Level Objective)** — A measurable target derived from an SLA, expressed as a PromQL query and a time window. SLOs are in `observability/slos/`. They are the operational expression of the commitments in `contracts/slas/`.

**SLA (Service Level Agreement)** — The business commitment to a specific level of service, negotiated with stakeholders. SLAs are in `contracts/slas/`. They are human-readable and business-facing.

**Burn Rate** — The rate at which error budget is consumed relative to the budget allocation rate. A burn rate of 1.0 means budget is consumed at exactly the rate it is allocated; at 14.4x, the monthly budget will be exhausted in 2 days. Burn rate alerts are the primary on-call signal.

**CQRS (Command Query Responsibility Segregation)** — A pattern where the write model (handling commands) and read model (handling queries) are separate stores, updated asynchronously. Used in Inventory: writes to PostgreSQL; reads from a Redis projection.

**Event Sourcing** — A persistence pattern where state is derived by replaying a log of domain events, rather than storing the current state directly. Used in Orders: the EventStoreDB stream for an order is the system of record; the current state is a projection.

**IRSA (IAM Roles for Service Accounts)** — An AWS mechanism that assigns an IAM role to a Kubernetes service account via OIDC federation. Each service has one IRSA-bound IAM role with the minimum permissions needed.

**OTLP (OpenTelemetry Protocol)** — The wire protocol for emitting telemetry signals (traces, metrics, logs) from services to the OTEL Collector.

**Outbox Pattern** — A reliability pattern for event publishing. Instead of publishing directly to Kafka, the service writes the event to a local outbox table within the same database transaction as the domain state change. A separate process reliably reads the outbox and publishes to Kafka, guaranteeing at-least-once delivery.

---

## Context-Specific Overloads

The following terms have different meanings in different bounded contexts. Always qualify with context when ambiguous.

| Term | In Orders context | In Inventory context |
|---|---|---|
| **Quantity** | Number of units on an order line | Available-for-reservation count for a SKU |
| **Status** | OrderStatus enum (Pending, Confirmed, Cancelled) | Not a first-class term; use stock level + reservation count |
| **Cancel** | Terminate an Order before confirmation | Release a reservation |
