import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { Counter, Histogram, ObservableGauge } from '@opentelemetry/api';

// Metric names must match observability-requirements.md exactly.
// Histogram buckets include the SLA p99 boundary (2000ms → 2.0s) per ADR-0008.

const meter = new MeterProvider().getMeter('fulfillment-gateway');

const LATENCY_BUCKETS = [0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];

export const otel = {
  dispatchAttempts: meter.createCounter('fulfillment.dispatch_attempts_total', {
    description: 'Total OrderConfirmed events received for dispatch',
  }) as Counter,

  dispatchSuccesses: meter.createCounter('fulfillment.dispatch_successes_total', {
    description: 'OrderConfirmed events successfully dispatched to WMS',
  }) as Counter,

  dispatchErrors: meter.createCounter('fulfillment.dispatch_errors_total', {
    description: 'Dispatch failures by reason: warehouse_error or wms_rejected',
  }) as Counter,

  warehouseCallDuration: meter.createHistogram('fulfillment.warehouse_call_duration_seconds', {
    description: 'End-to-end WMS SOAP call duration; SLA p99 boundary is 2.0s',
    advice: { explicitBucketBoundaries: LATENCY_BUCKETS },
  }) as Histogram,

  // 0 = closed (healthy), 1 = open (blocking calls), 2 = half-open (probing)
  // Recorded by WarehouseClient on every state transition.
  circuitBreakerState: meter.createHistogram('fulfillment.circuit_breaker_state', {
    description: 'Current circuit breaker state: 0=closed, 1=open, 2=half-open',
    advice: { explicitBucketBoundaries: [0, 1, 2] },
  }) as Histogram,

  consumerLagSeconds: meter.createHistogram('fulfillment.consumer_lag_seconds', {
    description: 'Kafka consumer lag in seconds; SLA threshold is 60s',
    advice: { explicitBucketBoundaries: [1, 5, 15, 30, 60, 120, 300] },
  }) as Histogram,
};
