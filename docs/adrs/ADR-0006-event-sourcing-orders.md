# ADR-0006: Event Sourcing for the Orders Domain

**Status**: Accepted
**Date**: 2026-01-25

---

## Context

The Orders domain has three properties that make event sourcing particularly valuable:

1. **Full audit requirement**: Every state change on an Order must be traceable for financial reconciliation and dispute resolution.
2. **Saga compensation**: When the place-order saga fails (e.g., payment declined after stock was reserved), we need to replay the causal chain to trigger correct compensation.
3. **Temporal queries**: "What was the state of this order at 14:32:07?" is a legitimate customer support query. With a traditional mutable store, this requires dedicated audit tables. With event sourcing, it is a stream replay.

Inventory and Customers do not share these requirements — their access patterns are primarily CRUD and their audit requirements can be met with PostgreSQL row versioning.

## Decision

The Orders domain uses EventStoreDB as its system of record. Every command that changes an Order (Place, Confirm, Cancel) appends an immutable event to the Order's stream. The current Order state is a projection of the stream. EventStoreDB's optimistic concurrency (expected version) enforces INV-ORD-010 (unique IDs) and prevents concurrent modification.

Domain events are forwarded to Kafka via the outbox pattern (a dedicated projection reads the EventStoreDB stream and publishes to `chakra.orders.*` topics).

## Rationale

**Audit trail is free**: The event stream is the audit trail. No separate audit table.
**Saga compensation**: The outbox consumer can replay the `OrderPlaced` stream to reconstruct what happened before failure, enabling precise compensation.
**Temporal queries**: `ReadStreamEvents(orderId, fromPosition: 0, toPosition: timestamp)` reconstructs the order state at any point in time.

## Consequences

**Positive**: Full audit trail; saga compensation is first-class; temporal queries without extra tables.
**Negative**: EventStoreDB is an additional operational dependency; aggregate reconstruction requires stream replay (mitigated by snapshots for long-lived streams); eventual consistency between the event stream and any projection.

## Alternatives Considered

**PostgreSQL with audit triggers**: Provides audit trail but not replay semantics. Compensation logic must be custom-built.

**Event sourcing for all services**: Inventory and Customers don't need it. The operational overhead (EventStoreDB, stream projections) is not justified for CRUD-heavy domains.

## Related

- [ADR-0004](ADR-0004-kafka-event-bus.md): Kafka is the integration bus; EventStoreDB is the persistence layer
- [contracts/domain-invariants/orders-invariants.md](../../contracts/domain-invariants/orders-invariants.md): INV-ORD-010 (unique IDs), INV-ORD-005 (immutability after confirmation)
