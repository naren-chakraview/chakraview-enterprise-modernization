# ADR-0003: Strangler Fig Migration Pattern

**Status**: Accepted
**Date**: 2026-01-20

---

## Context

The legacy monolith cannot be taken offline for a rewrite. It processes $2M/day in orders. Any migration must maintain 100% traffic continuity. The monolith's codebase is 8 years old with 40% test coverage and no domain boundary enforcement.

## Decision

We use the strangler fig pattern. An API gateway (Kong) is deployed in front of the monolith on day one. Traffic for extracted bounded contexts is routed to new services by URL path prefix. The monolith continues to serve all other traffic. Each phase is independently reversible: routing can be reverted to the monolith within 5 minutes by updating Kong config.

## Rationale

The strangler fig isolates risk to one bounded context at a time. A failed extraction affects only that context's traffic — not the entire platform. Each phase ends with a validation period where SLA compliance is confirmed before the monolith handlers for that context are decommissioned.

## Consequences

**Positive**: Zero-downtime migration; each phase reversible; risk isolated per context.
**Negative**: Dual-system complexity during migration; data synchronization overhead between monolith DB and service DBs; Kong becomes a critical single point of failure (mitigated by HA deployment).

## Related

- [ADR-0001](ADR-0001-contract-first-development.md): Each extracted service requires a contract before extraction begins
- [docs/migration/strategy.md](../migration/strategy.md): Full phase plan
