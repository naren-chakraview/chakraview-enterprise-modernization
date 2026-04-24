# ADR-0014: Sidecar Pattern for Cross-Cutting Infrastructure Concerns

**Status**: Accepted
**Date**: 2024-03-15
**Deciders**: Platform team
**Supersedes**: —

---

## Context

Every service in the platform requires three cross-cutting infrastructure behaviors:

1. **Mutual TLS (mTLS)**: Service-to-service calls must be authenticated and encrypted. No service should trust a caller based on network location alone.
2. **Traffic policy enforcement**: Circuit breaking, connection pool limits, retries, and timeout policies must be consistent across the fleet and enforceable without application code changes.
3. **Telemetry collection**: Every service must emit traces, metrics, and logs in a standard format (ADR-0008). The collection pipeline must not be implemented per-service.

If each service implements these concerns in application code, three problems emerge:
- Each TypeScript service re-implements mTLS handshaking, OTEL SDK wiring, and retry logic — inconsistently.
- A policy change (e.g., increasing a timeout threshold) requires a code change and redeploy in every service.
- New services must remember to include the boilerplate or silently violate the security and observability requirements.

---

## Decision

All three concerns are moved out of application code into **sidecars** — processes injected into each pod by platform operators, not by service authors.

### Sidecar 1 — Envoy (via Istio)

Injected by the Istio control plane when a pod's namespace has `istio-injection: enabled` or the pod carries `sidecar.istio.io/inject: "true"`.

Responsibilities:
- mTLS with SPIFFE/X.509 identity (PeerAuthentication: STRICT in every `chakra-*` namespace)
- Traffic policy enforcement per DestinationRule (ADR-0012: circuit breaking, connection pool limits)
- Automatic HTTP metrics (request rate, error rate, latency) emitted to the OTEL Collector sidecar
- Header propagation for distributed trace context (B3 / W3C TraceContext)

The application code contains **zero TLS code and zero retry logic**. Envoy handles both.

### Sidecar 2 — OTEL Collector (via OTEL Operator)

Injected by the OpenTelemetry Operator when a pod's namespace matches the `Instrumentation` CR (see `observability/otel/instrumentation-cr.yaml`).

Responsibilities:
- Receives OTLP spans and metrics from the application SDK via `localhost:4317`
- Batches and forwards to the central Grafana stack (Tempo, Mimir, Loki)
- Applies resource attributes (pod name, namespace, service version) to all signals

The application code instantiates the OTEL SDK and calls `meter.createCounter()` / `tracer.startSpan()`. It does **not** configure exporters, batch processors, or resource detection — the sidecar handles all of that.

---

## Constraint

The architectural compliance agent (Persona 6) checks:
- `sidecar.istio.io/inject: "true"` annotation is present in every service Deployment template.
- No service Deployment sets `sidecar.istio.io/inject: "false"` without an ADR amendment.
- No service imports a TLS library or implements its own metrics transport.
- `PeerAuthentication` mode is `STRICT` in every `chakra-*` namespace.

---

## Consequences

**Positive:**
- A new service inherits mTLS, traffic policy, and telemetry collection automatically at deploy time.
- Platform policy changes (e.g., circuit breaker thresholds) are applied by updating a DestinationRule, not by touching service code.
- The Envoy sidecar's metrics (request rate, latency) are available for every service without a single line of application instrumentation for those signals.

**Negative:**
- Every pod runs two additional processes (Envoy + OTEL Collector). On constrained nodes this is ~50MB additional RAM per pod.
- Debugging mTLS failures requires understanding Envoy's access log format, not just application logs.
- The Istio control plane is a platform dependency with its own availability requirement.

---

## Related

- [ADR-0008](ADR-0008-opentelemetry.md) — OTEL as the instrumentation standard (application-level SDK usage)
- [ADR-0012](ADR-0012-circuit-breaker.md) — Circuit breaking enforced via Envoy DestinationRule
- [ADR-0013](ADR-0013-bulkhead-isolation.md) — Bulkhead isolation; namespace-level `PeerAuthentication` is part of the isolation boundary
- `observability/otel/instrumentation-cr.yaml` — OTEL Operator CR; defines which namespaces get the collector sidecar
- `infrastructure/helm/charts/*/templates/deployment.yaml` — Deployment templates with Istio injection annotation
