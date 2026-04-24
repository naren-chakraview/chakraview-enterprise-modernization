# Sequence Diagram: Choreography — OrderConfirmed Flow

This diagram shows the choreography-based flow triggered when an order is confirmed. Contrast with [`sequence-place-order.md`](sequence-place-order.md), which uses saga orchestration with a central coordinator.

In choreography, the Orders service publishes a domain event and is done. It does not know who is listening. Each consumer reacts independently at its own pace.

---

```mermaid
sequenceDiagram
    autonumber
    participant Orders as Orders Service
    participant Kafka as Kafka<br/>chakra.orders.confirmed
    participant FG as Fulfillment Gateway<br/>(consumer group: fulfillment-gateway)
    participant WMS as Warehouse System<br/>(legacy on-prem)
    participant Inv as Inventory Service<br/>(consumer group: inventory-analytics)
    participant OTEL as OTEL Collector

    Note over Orders,Kafka: Orchestration ends here — order is confirmed, saga is complete

    Orders->>Kafka: publish OrderConfirmed<br/>{orderId, items, shippingAddress, occurredAt}
    Note over Orders: Orders responsibility ends.<br/>No knowledge of downstream consumers.

    par Fulfillment Gateway reacts
        Kafka-->>FG: deliver OrderConfirmed (offset committed per message)
        FG->>OTEL: dispatch_attempts_total +1
        FG->>WMS: SOAP DispatchRequest<br/>{OrderID, OrderLines, DeliveryAddress}
        Note over FG,WMS: WarehouseClient.toWmsRequest() translates<br/>domain types to legacy SOAP vocabulary
        WMS-->>FG: SOAP DispatchResponse {Status: ACCEPTED, WMSRef}
        FG->>OTEL: dispatch_successes_total +1<br/>warehouse_call_duration_seconds.observe()
        FG->>Kafka: commit offset
    and Inventory cache warms (future consumer)
        Kafka-->>Inv: deliver OrderConfirmed
        Inv->>Inv: update stock projection cache<br/>(analytics / demand forecasting)
        Inv->>Kafka: commit offset
    end

    Note over FG,WMS: If WMS call fails: retry up to 3×,<br/>then dead-letter to chakra.fulfillment.dlq.<br/>Orders SLA is not affected.
```

---

## Key Properties

**Decoupling**: The Orders service has no reference to the Fulfillment Gateway or Inventory analytics consumers. Adding a new consumer (notification service, audit log) requires zero changes in Orders.

**Independent failure domains**: A WMS outage that opens the circuit breaker in the Fulfillment Gateway causes consumer lag to accumulate on `chakra.orders.confirmed`. The Orders service continues placing and confirming orders unaffected. The Fulfillment SLA is breached; the Orders SLA is not.

**Contrast with Orchestration**: In the place-order saga, the Orders service issues a `ReserveStock` command and waits for the result before proceeding. The outcome of each step determines whether the saga continues or compensates. Choreography has none of this — the event is published once, and each consumer is self-contained.

---

## Observability

Tracing the full chain requires distributed tracing (ADR-0008). The `OrderConfirmed` event carries the `traceId` from the originating `PlaceOrder` request. The Fulfillment Gateway propagates this `traceId` on its WMS SOAP call, making the full chain visible in Grafana Tempo:

```
PlaceOrder HTTP request
  └── ReserveStock command (saga orchestration)
  └── CapturePayment (saga orchestration)
  └── OrderConfirmed published
        └── Fulfillment Gateway: dispatchFulfillment (choreography)
              └── WMS SOAP call
```
