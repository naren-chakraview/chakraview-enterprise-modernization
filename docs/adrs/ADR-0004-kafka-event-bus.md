# ADR-0004: Apache Kafka as the Event Bus

**Status**: Accepted
**Date**: 2026-01-20

---

## Context

Services need to publish and consume domain events asynchronously. We evaluated Apache Kafka (Amazon MSK), RabbitMQ, Amazon SNS/SQS, and AWS EventBridge.

## Decision

Apache Kafka via Amazon MSK. Topics are named `chakra.{context}.{event-type}` (e.g., `chakra.orders.order-placed`). Retention is 7 days for operational topics; 30 days for audit topics. Schema registry is not adopted at launch (see tradeoffs).

## Rationale

**Replayability**: The saga compensation pattern requires consumers to replay events during debugging and recovery. Kafka's log retention enables this; RabbitMQ's queue model does not.

**Consumer group model**: Multiple services can independently consume the same event stream (Orders publishes `OrderPlaced`; Inventory consumes it to reserve stock; Analytics consumes it for reporting). Each consumer group maintains independent offsets.

**Consumer lag observability**: Kafka consumer lag is a first-class metric. `observability/alerts/kafka-lag.yaml` alerts when lag exceeds thresholds. This is not possible with SNS/SQS without additional instrumentation.

## Consequences

**Positive**: Log retention for replay; independent consumer groups; lag observability; MSK handles broker management.
**Negative**: Operational complexity vs. managed queues; schema evolution without a registry requires consumer-side forward compatibility; MSK cost vs. SQS.

## Related

- [ADR-0006](ADR-0006-event-sourcing-orders.md): Events from EventStoreDB are forwarded to Kafka via the outbox pattern
