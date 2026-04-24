// Agent-generated from:
//   contracts/slas/orders-sla.yaml  (latency targets → histogram buckets)
//   ai-agents/context/observability-requirements.md (required metric names)

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('orders-service', '1.0.0');

// Bucket boundaries include 0.5s (from SLA latency_p99_ms: 500 → 500/1000 = 0.5s)
// so the SLO query `le="0.5"` has a meaningful bucket.
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];

// ── Required metrics (observability-requirements.md) ──────────────────────────

export const requestDuration = meter.createHistogram('orders_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: { explicitBucketBoundaries: LATENCY_BUCKETS },
});

export const requestsTotal = meter.createCounter('orders_requests_total', {
  description: 'Total HTTP requests',
});

export const errorsTotal = meter.createCounter('orders_errors_total', {
  description: 'Total errors by reason',
});

// ── Business metrics ──────────────────────────────────────────────────────────

export const ordersPlacedTotal = meter.createCounter('orders_placed_total', {
  description: 'Orders successfully placed',
});

// Saga duration buckets include the SLA max compensation latency of 5000ms
const SAGA_BUCKETS = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0];

export const sagaDuration = meter.createHistogram('orders_saga_duration_seconds', {
  description: 'End-to-end saga duration from OrderPlaced to Confirmed or Cancelled',
  unit: 's',
  advice: { explicitBucketBoundaries: SAGA_BUCKETS },
});

export const sagaCompensationTotal = meter.createCounter('orders_saga_compensation_total', {
  description: 'Saga compensation events triggered',
});
