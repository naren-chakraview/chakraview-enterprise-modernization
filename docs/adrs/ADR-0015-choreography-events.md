# ADR-0015: Choreography for Downstream Event Reactions

**Status**: Accepted
**Date**: 2024-03-15
**Deciders**: Orders team, Platform team
**Supersedes**: —

---

## Context

The system uses two distinct coordination models for multi-service interactions:

1. **Saga Orchestration** — A central orchestrator (the Orders service) issues commands to other services and handles compensation when steps fail. Used for the place-order flow (ADR-0006).
2. **Choreography** — Services react to published domain events independently, with no central coordinator. No service knows which other services are listening.

The existing place-order saga documents orchestration well, but the system also contains choreography flows that have not been explicitly named or governed. This ADR establishes when to use each pattern.

---

## Decision

**Use choreography when all of the following hold:**

- The downstream reaction does not affect the originating service's domain invariants.
- Failure of the downstream reaction does not require compensation in the originating service.
- The originating service has no business reason to know whether the downstream reacted.

**Use saga orchestration when any of the following hold:**

- The distributed transaction must be compensated if a step fails (e.g., reverse a stock reservation if payment fails).
- The originating service needs to know the outcome of a downstream step before proceeding.
- The coordination involves a shared invariant (e.g., "stock must be reserved before payment is captured").

---

## Choreography Flows in This System

| Event published | Producer | Consumers | Why choreography |
|---|---|---|---|
| `OrderConfirmed` | Orders | Fulfillment Gateway | Orders does not care whether WMS received the dispatch; WMS failure does not breach Orders SLA |
| `CustomerRegistered` | Customers | Inventory (cache warm) | Inventory cache warming is a performance optimization; failure has no correctness consequence |
| `CustomerSuspended` | Customers | Orders (read cache invalidation) | Cache invalidation is eventually consistent by design; Orders will enforce suspension at command time |
| `StockReserved` | Inventory | Analytics pipeline (future) | Analytics reactions are fire-and-forget; they do not participate in the commerce invariants |

---

## Consequences

**Positive:**
- The Orders service is fully decoupled from the Fulfillment Gateway. A new downstream consumer (analytics, notifications, audit log) can be added without touching Orders.
- The Fulfillment Gateway's SLA failures do not cascade to Orders. A WMS outage is isolated.
- Kafka's consumer group model means each downstream can process at its own pace independently.

**Negative:**
- The end-to-end behavior of a choreography flow is harder to observe: no single place shows "order confirmed → fulfillment dispatched → WMS acknowledged." Requires distributed tracing (ADR-0008) to reconstruct the chain.
- Schema evolution requires all consumers to be contacted; there is no single choreography coordinator to update.
- Debugging a missed downstream reaction requires knowing which consumers exist — the event catalog (`docs/architecture/diagrams/event-catalog.md`) is the source of truth.

---

## Guardrails

- Every domain event published for choreography must appear in `api/asyncapi/` with the list of known consumers documented.
- A choreography consumer that requires compensating behavior (e.g., Fulfillment Gateway needs to un-dispatch if an order is cancelled) must publish its own event, not call back into the producer.
- The compliance agent (Persona 6) checks that no choreography consumer imports types from the producer's service directory (ADR-0005).

---

## Related

- [ADR-0004](ADR-0004-kafka-event-bus.md) — Kafka as the choreography transport
- [ADR-0006](ADR-0006-event-sourcing-orders.md) — Orchestration model for the place-order saga (contrast)
- [ADR-0011](ADR-0011-leave-and-layer-warehouse.md) — Fulfillment Gateway (primary choreography consumer)
- `docs/architecture/diagrams/sequence-choreography.md` — Sequence diagram for the `OrderConfirmed` choreography flow
