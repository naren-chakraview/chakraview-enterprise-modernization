# ADR-0008: OpenTelemetry as the Instrumentation Standard

**Status**: Accepted
**Date**: 2026-01-28

---

## Context

Three separate instrumentation libraries were in use across the engineering org: Datadog APM, Prometheus client, and a homegrown structured logging library. Switching observability backends required code changes. AI agents generating service code had no single standard to implement against.

## Decision

All services use the OpenTelemetry SDK for traces, metrics, and logs. The OTEL Collector receives all telemetry via OTLP and exports to backend-specific systems (Tempo for traces, Mimir for metrics, Loki for logs). The OTEL Operator auto-injects agents into all `chakra-*` Kubernetes namespaces. Service code only depends on the OTEL SDK — never on a specific backend.

Custom business metrics (order throughput, stock reservation success rate) are registered in each service's `OtelInstrumentation.ts` using metric names mandated by `ai-agents/context/observability-requirements.md`.

## Rationale

**Vendor neutrality**: Changing the observability backend requires only a change to the OTEL Collector config, not service code.
**Single standard for agents**: Every agent implementing a service reads `ai-agents/context/observability-requirements.md` and registers the same set of metrics. SLO queries reference predictable metric names.
**Auto-injection**: The OTEL Operator handles framework-level instrumentation (HTTP, database, Kafka). Service code only adds business metrics.

## Consequences

**Positive**: Vendor-neutral; consistent metric naming; SLA measurement is reliable.
**Negative**: OTEL SDK adds ~5MB to service binary; auto-injection requires the OTEL Operator CRD; cardinality discipline required (high-cardinality labels break Mimir).
