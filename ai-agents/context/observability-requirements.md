# Observability Requirements

Every service implementation produced by an AI agent must meet these requirements. These are not optional. A service that does not register the required metrics cannot have its SLA measured, which means it cannot be operated safely.

---

## Required Metrics (all services)

Every service must register these metrics using the OpenTelemetry SDK. Metric names are fixed — SLO queries in `observability/slos/` depend on them.

| Metric name | Type | Labels | Description |
|---|---|---|---|
| `{service}_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests; used for availability SLO error rate |
| `{service}_errors_total` | Counter | `reason`, `route` | Total errors; `reason` is one of: `validation`, `domain`, `infrastructure`, `timeout` |
| `{service}_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request duration; buckets derived from SLA `latency_p99_ms` |

Where `{service}` = `orders`, `inventory`, or `customers`.

### Histogram Bucket Requirements

Buckets must include a boundary at the SLA `latency_p99_ms` target (divided by 1000 to convert to seconds) so the SLO query has a meaningful bucket at the threshold.

| Service | p99 target | Required bucket |
|---|---|---|
| orders | 500ms | 0.5 |
| inventory reads | 100ms | 0.1 |
| inventory writes | 300ms | 0.3 |
| customers | 300ms | 0.3 |

Standard additional buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5]`

---

## Required Business Metrics (per service)

### Orders Service

| Metric | Type | Labels | Description |
|---|---|---|---|
| `orders_placed_total` | Counter | `currency` | Orders placed; used for throughput monitoring |
| `orders_saga_duration_seconds` | Histogram | `outcome` (success/compensation) | End-to-end saga duration |
| `orders_saga_compensation_total` | Counter | `reason` | Saga compensations triggered |

### Inventory Service

| Metric | Type | Labels | Description |
|---|---|---|---|
| `inventory_reservations_total` | Counter | `outcome` (success/rejected/expired) | Reservation attempts and results |
| `inventory_stock_level` | Gauge | `sku` | Current available stock (top 100 SKUs only; avoid high cardinality) |
| `inventory_projection_lag_seconds` | Gauge | — | Redis projection lag behind Postgres write model |

### Customers Service

| Metric | Type | Labels | Description |
|---|---|---|---|
| `customers_registrations_total` | Counter | `channel` | New registrations by acquisition channel |
| `customers_suspensions_total` | Counter | `reason` | Account suspensions |

---

## Required Trace Spans

Every inbound HTTP request must produce a trace span with:
- `http.method`, `http.route`, `http.status_code` attributes (auto-injected by OTEL Operator)
- `service.name` resource attribute = the Kubernetes service name
- `deployment.environment` resource attribute = `staging` or `production`

Kafka consumer handlers must produce a child span with:
- `messaging.system` = `kafka`
- `messaging.destination` = topic name
- `messaging.operation` = `receive`

---

## Required Log Fields

Every log entry must include these fields as structured JSON:

```json
{
  "timestamp": "ISO 8601 UTC",
  "level": "info | warn | error",
  "service": "orders",
  "traceId": "hex string from active span",
  "spanId": "hex string from active span",
  "msg": "human-readable message"
}
```

Do not log PII (customer email, payment card numbers) in structured fields. Use obfuscation helpers from `ai-agents/context/coding-standards.md`.

---

## OTEL SDK Initialization Pattern

All services must initialize OTEL using the following pattern (from `coding-standards.md`):

```typescript
// OtelInstrumentation.ts — initialize before any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

// SDK is initialized once at process start.
// All instruments (counters, histograms) are registered here, not in business logic.
```

Instruments are created once at module load time. Do not create new instruments per request.
