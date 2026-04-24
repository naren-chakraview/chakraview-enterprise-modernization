# ADR-0012: Circuit Breaker for External Dependency Calls

**Status**: Accepted
**Date**: 2024-03-15
**Deciders**: Platform team, Orders team
**Supersedes**: —

---

## Context

Two service boundaries in this system involve calls to external systems that can fail unpredictably:

1. **Orders → Payment Gateway** (Stripe/Adyen): An external HTTPS API. Degradation cascades into the place-order saga, blocking order confirmations.
2. **Fulfillment Gateway → WMS**: A legacy on-prem SOAP endpoint. The WMS has no SLA commitment for response time and has historically shown cascading failures under load.

Without a circuit breaker, a degraded downstream causes calling services to accumulate threads/connections in timeout wait, exhausting the caller's resource pool. This turns a partial downstream failure into a full caller failure.

---

## Decision

Apply the **Circuit Breaker** pattern at two levels:

### Level 1 — Istio DestinationRule (service mesh)

For **in-cluster service-to-service calls**, Istio's `outlierDetection` provides infrastructure-level circuit breaking without any application code changes. Applied to:
- Orders service calling the Payment Gateway (via a mesh egress rule)
- Any future service-to-service calls where the downstream is in-cluster or mesh-connected

Configuration:
- Consecutive 5xx threshold: 5 failures
- Ejection interval: 30 seconds
- Base ejection time: 30 seconds
- Max ejection percent: 100%

### Level 2 — Application-level circuit breaker (WarehouseClient)

For **out-of-mesh calls** (the WMS SOAP endpoint is on-prem and not in the Istio mesh), the Fulfillment Gateway implements a circuit breaker directly in `WarehouseClient.ts`.

The state machine mirrors the standard three-state model:
- **Closed** (normal): calls pass through; consecutive failure counter increments on each failure
- **Open** (tripped): calls are rejected immediately with `CircuitOpenError`; no WMS calls made
- **Half-open** (probing): one probe call is allowed after `OPEN_DURATION_MS`; success closes, failure re-opens

Thresholds are sourced from `contracts/slas/fulfillment-sla.yaml` (`circuit_breaker` block) to keep them in the human-authored source of truth.

---

## Consequences

**Positive:**
- A WMS outage causes Fulfillment Gateway consumer lag to accumulate rather than exhausting connection pools. The breaker opens, calls stop, Kafka lag alerts fire.
- The circuit breaker state is a named OTEL metric (`fulfillment.circuit_breaker_state`), making the transition to open/half-open visible in Grafana without log parsing.
- The Istio layer requires zero application code. It applies automatically to all services in the mesh.

**Negative:**
- Two circuit breaker implementations (Istio + application-level) require separate runbooks. Operators must understand which layer is active for each service boundary.
- The application-level circuit breaker in `WarehouseClient.ts` is in-process state, not shared across replicas. With 2 replicas, each maintains an independent breaker — the effective threshold is doubled.

---

## Multi-Replica Note

The in-process circuit breaker means each pod tracks failure state independently. With `min_replicas: 2`, a WMS failure will trip the breaker in each pod separately. The consumer group load-balances partitions across pods; all pods will see failures when the WMS is down, so both breakers will open within one failure window.

If precise cross-replica state is needed in the future, replace with a Redis-backed distributed circuit breaker. This is out of scope for Phase 1 of the Fulfillment Gateway.

---

## Related

- [ADR-0011](ADR-0011-leave-and-layer-warehouse.md) — Fulfillment Gateway (primary application-level circuit breaker host)
- `contracts/slas/fulfillment-sla.yaml` — Circuit breaker threshold source of truth
- `services/fulfillment-gateway/src/infrastructure/WarehouseClient.ts` — Implementation
- `infrastructure/helm/charts/fulfillment-gateway/templates/destination-rule.yaml` — Istio mesh rule
- `infrastructure/helm/charts/orders-service/templates/destination-rule.yaml` — Istio rule for Payment Gateway egress
