# ADR-0005: Database per Service

**Status**: Accepted
**Date**: 2026-01-20

---

## Context

The legacy monolith uses a single Oracle database shared across all domains. Tables from the Order domain are joined directly to Customer tables in dozens of queries. This creates deployment coupling (schema changes require coordination across teams), SLA coupling (a slow customer query degrades order throughput), and testing complexity (no service can be tested in isolation).

## Decision

Each bounded context owns its own data store. No service may connect to another service's database. Cross-service reads happen through published APIs or Kafka event consumption. Each service's schema is an implementation detail.

- **Orders**: EventStoreDB (event log)
- **Inventory**: PostgreSQL write model + Redis read cache
- **Customers**: PostgreSQL

## Rationale

Data isolation is the prerequisite for independent deployability. A service that shares a database cannot be deployed independently — every schema change is a coordinated change. It also cannot have an independent SLA: its latency is coupled to whoever else writes to the shared database.

## Consequences

**Positive**: Independent deployability; independent SLAs; each service can choose the right data model for its access patterns.
**Negative**: No cross-service joins; eventual consistency between services; data migration complexity during monolith extraction (dual-write, CDC).

## Related

- [docs/migration/data-migration-patterns.md](../migration/data-migration-patterns.md): How data is migrated from the shared Oracle DB to per-service stores
