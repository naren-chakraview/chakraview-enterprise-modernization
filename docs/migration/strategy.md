# Migration Strategy: Strangler Fig

## Goal

Migrate Chakra Commerce from a Java EE monolith to independent microservices with zero production downtime, each phase independently reversible, and measurable SLA compliance at each stage.

Success criteria:
- Each extracted service meets its SLA for 30 days before the monolith handler is decommissioned
- Zero order loss during any phase transition
- Rollback to previous state possible within 10 minutes at any point

---

## Why Strangler Fig

A big-bang rewrite of a $2M/day revenue system is not a risk the business will accept. The strangler fig pattern allows us to:

1. Deliver business value on the new architecture incrementally
2. Validate each bounded context independently under real traffic
3. Maintain a safe rollback path at every stage
4. Avoid a "dual maintenance" period where two full systems must be kept in sync

---

## Phase Overview

| Phase | What is extracted | Key challenge | Rollback cost | Status |
|---|---|---|---|---|
| 1 — Facade | Kong gateway as routing facade | Kong becomes critical path | Low — remove Kong, traffic back to monolith | Done |
| 2 — Customers | Customer registration + accounts | Data sync from Oracle → Postgres | Low — re-route /v1/customers/* to monolith | Done |
| 3 — Inventory | Stock levels + reservations | CDC pipeline; dual-write window | Medium — consumer lag reconciliation | In progress |
| 4 — Orders | Order lifecycle + saga | Event sourcing adoption; saga coordination | High — EventStoreDB rollback is complex | Planned |
| 5 — Decommission | Monolith shutdown | All traffic on new services; rollback path gone | Irreversible | Planned |

---

## Extraction Order Rationale

**Customers first**: No upstream dependencies at the service boundary. The Customers context has the simplest domain model and the lowest blast radius if something goes wrong. Extracting it first gives the team practice with the full extraction workflow (CDC, dual-write, traffic routing, SLA validation) before tackling more complex contexts.

**Inventory second**: Moderate complexity. The CQRS read model introduces the first non-trivial architectural pattern. The CDC pipeline (Oracle → Kafka → Postgres) is the critical path for this phase. Inventory has no dependency on Customers at the service level (it consumes CustomerRegistered events only for cache warming, not for correctness).

**Orders last**: Highest complexity. Event sourcing is a significant departure from the monolith's CRUD model. The place-order saga coordinates with Inventory (which must be fully extracted) and Payment. This phase is not started until Inventory has been stable for 30 days.

---

## Data Migration Approach

See [`data-migration-patterns.md`](data-migration-patterns.md) for details.

**Dual-write**: During extraction, the new service and the monolith both write to their respective stores. The monolith writes to Oracle; the new service writes to its Postgres. A reconciliation job compares both stores and alerts on divergence > 0.1%.

**CDC via Debezium**: For historical data (existing customer records, stock levels), Debezium captures change events from Oracle and replays them into the new service's Postgres schema. The CDC pipeline must drain before traffic is shifted.

**Traffic canary**: New service traffic starts at 1%. If SLA holds for 24 hours, ramp to 10%, then 50%, then 100%. If SLA degrades at any weight, roll back to the previous weight.

---

## Rollback Gates (per phase)

A phase may not advance without explicit approval. A phase is rolled back automatically if:
- SLA breach (burn rate > 2x for 15 minutes)
- Data divergence > 0.1% for > 5 minutes
- Kafka consumer lag > 10 seconds for > 5 minutes (phases 3+)

Manual rollback procedure: [`docs/runbooks/rollback-deployment.md`](../runbooks/rollback-deployment.md)

---

## Phase Docs

- [Phase 1: Facade Layer](phase-1-facade.md)
- [Phase 2: Extract Customers](phase-2-customers.md)
- [Phase 3: Extract Inventory](phase-3-inventory.md)
- [Phase 4: Extract Orders](phase-4-orders.md)
- [Phase 5: Decommission Monolith](phase-5-decommission.md)
