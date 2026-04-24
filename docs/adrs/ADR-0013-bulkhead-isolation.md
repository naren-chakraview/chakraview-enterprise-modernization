# ADR-0013: Bulkhead Isolation

**Status**: Accepted
**Date**: 2024-03-15
**Deciders**: Platform team
**Supersedes**: —

---

## Context

In a microservices deployment, resource exhaustion in one service can cascade to others through shared infrastructure. Two failure modes are common:

1. **Node-level resource starvation**: A memory leak or CPU spike in one service consumes node resources, causing pod evictions in unrelated services on the same node.
2. **Connection pool exhaustion**: A slow downstream causes a service's HTTP client to hold connections open, exhausting the pool and blocking unrelated requests through the same pool.

Without explicit isolation, a bug in the Fulfillment Gateway (a low-traffic background service) can degrade the Orders service (the highest-priority SLA in the system).

---

## Decision

Apply the **Bulkhead** pattern at two levels.

### Level 1 — Namespace-level resource isolation (Kubernetes)

Each bounded context runs in its own Kubernetes namespace with a `ResourceQuota` that caps total CPU and memory consumption. A service that leaks memory hits its namespace quota before it can affect other namespaces.

```
chakra-orders:      CPU 4 cores / Memory 4Gi
chakra-inventory:   CPU 6 cores / Memory 6Gi  (high read throughput)
chakra-customers:   CPU 2 cores / Memory 2Gi
chakra-fulfillment: CPU 1 core  / Memory 1Gi  (background; lowest priority)
chakra-platform:    CPU 4 cores / Memory 4Gi  (Kong, ArgoCD, cert-manager)
```

A `LimitRange` in each namespace sets default container `requests` and `limits`, ensuring no container runs without resource constraints (required by Principle 9).

### Level 2 — Connection pool isolation (Istio DestinationRule)

Each service's Istio DestinationRule (ADR-0012) sets explicit `connectionPool` limits per downstream. A slow Payment Gateway cannot hold more than 20 TCP connections from the Orders service — additional requests are rejected with a 503, which the circuit breaker counts toward its failure threshold.

This is the connection-pool bulkhead pattern: each downstream dependency has its own pool, sized to its SLA budget. A downstream degradation exhausts only its pool, not a shared pool used by all outbound calls.

---

## Consequences

**Positive:**
- A Fulfillment Gateway memory leak (caused by accumulated dead-letter events) cannot evict Orders pods.
- A degraded Payment Gateway cannot exhaust the Orders service's outbound connection pool, preventing cascading failures into the saga flow.
- ResourceQuotas provide a hard enforcement mechanism; teams cannot accidentally over-provision without cluster operator approval.

**Negative:**
- Namespace quotas must be reviewed as services scale. A quota that is too tight will cause OOMKilled pods during traffic spikes; too loose and the isolation is nominal.
- LimitRanges interact with HPA: if `limits.cpu` is low relative to the HPA `cpu_target_percent`, the HPA will scale aggressively. Values in `tooling/service-manifest.yaml` must be kept consistent.

---

## Quota Values

Quota values are defined in `infrastructure/kubernetes/policies/resource-quotas.yaml` and must match the `resources` block in `tooling/service-manifest.yaml` (limits × max_replicas, with 20% headroom).

When `tooling/service-manifest.yaml` is updated, `validate-contracts.sh` checks that namespace quotas are consistent with the new values.

---

## Related

- [ADR-0012](ADR-0012-circuit-breaker.md) — Connection pool limits in DestinationRule (Level 2 bulkhead)
- [ADR-0014](ADR-0014-sidecar-mesh.md) — Istio enforces the Level 2 bulkhead; application code contains no connection pool logic
- `infrastructure/kubernetes/policies/resource-quotas.yaml` — Level 1 namespace quotas
- `tooling/service-manifest.yaml` — Source of truth for per-service resource sizing
- Principle 9 (docs/architecture/principles.md) — Least privilege and resource constraints
