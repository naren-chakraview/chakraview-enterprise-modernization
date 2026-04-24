# ADR-0007: CQRS for the Inventory Domain

**Status**: Accepted
**Date**: 2026-01-25

---

## Context

Inventory has a heavily asymmetric read/write ratio. Stock level queries (from product pages, search results, cart validation) run at ~5,000 RPS. Stock reservations (from order placement) run at ~200 RPS. The read path requires sub-10ms latency; the write path requires strong consistency (no oversell, INV-INV-001).

Serving both from PostgreSQL is possible at current scale but creates two problems:
1. Read queries compete with write transactions for I/O and connection pool slots.
2. The p99 read latency of 100ms (in `contracts/slas/inventory-sla.yaml`) is difficult to meet under write load on PostgreSQL.

## Decision

CQRS for the Inventory domain. The write model is PostgreSQL — all reservations and releases go through it with row-level locking. The read model is a Redis hash maintained by a Kafka consumer. When a `StockReserved` or `StockReleased` event is published, the consumer updates the Redis projection.

Read queries are served exclusively from Redis. No read path touches PostgreSQL.

## Rationale

Redis GET is sub-1ms at p99 under normal load, well within the 100ms read SLA. The Kafka consumer projection lag introduces eventual consistency (target: < 100ms lag per `contracts/slas/inventory-sla.yaml`). This is acceptable because stock level queries are informational — the definitive reservation decision is made against PostgreSQL.

## Consequences

**Positive**: Read latency well within SLA; read and write paths scale independently; PostgreSQL protected from read load spikes.
**Negative**: Eventual consistency on reads; Redis is an additional dependency; projection must be rebuilt from Kafka topic on Redis failure.

## Related

- [contracts/domain-invariants/inventory-invariants.md](../../contracts/domain-invariants/inventory-invariants.md): INV-INV-006 — Redis projection is not authoritative for write decisions
- [contracts/slas/inventory-sla.yaml](../../contracts/slas/inventory-sla.yaml): consistency.read_write_lag_ms = 100
