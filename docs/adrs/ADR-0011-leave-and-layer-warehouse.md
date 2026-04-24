# ADR-0011: Leave-and-Layer Pattern for Warehouse Integration

**Status**: Accepted
**Date**: 2024-03-15
**Deciders**: Platform team, Orders team
**Supersedes**: —

---

## Context

The Chakra Commerce monolith sends fulfillment instructions to an on-premises Warehouse Management System (WMS) using a SOAP-over-HTTP interface. The WMS is a vendor product under a long-term support contract. It cannot be modified, has no staging environment, and its vendor has a 72-hour SLA for configuration changes.

When the Orders bounded context is extracted from the monolith (Phase 4), it needs to continue sending fulfillment instructions to the WMS. The options considered were:

1. Have the Orders service call the WMS SOAP API directly.
2. Build a modern Fulfillment service and migrate the WMS in parallel with the Orders extraction.
3. Deploy a Fulfillment Gateway that layers a modern interface on top of the WMS, leaving the WMS untouched.
4. Use the Strangler Fig pattern to route traffic to both the WMS and a future modern service simultaneously.

---

## Decision

We apply the **Leave-and-Layer** pattern. The WMS is left exactly as it is. A new **Fulfillment Gateway** service is deployed as a thin asynchronous proxy layer between the Kafka event bus and the WMS SOAP API.

- **Leave**: The WMS vendor contract, SOAP interface, and on-prem deployment are not touched.
- **Layer**: The Fulfillment Gateway subscribes to `chakra.orders.confirmed` Kafka events and translates `OrderConfirmed` domain events into WMS SOAP calls. All upstream services (Orders, Inventory) publish domain events and have no knowledge of the WMS.

This pattern differs from Strangler Fig in a critical way: **Strangler Fig is about replacing the legacy system by routing traffic away from it**. Leave-and-Layer is for when the legacy system is authoritative and not being replaced yet — the new layer adapts the interface, not the behavior.

---

## Consequences

**Positive:**
- The Orders service has no SOAP dependency. It publishes an event and is done.
- The WMS is decoupled from the rest of the platform. A future Fulfillment service can replace the gateway without any changes to Orders or Inventory.
- The Fulfillment Gateway can retry, buffer, and dead-letter independently of the event-producing services.
- The gateway's SLA (`contracts/slas/fulfillment-sla.yaml`) is owned separately from Orders. A WMS outage does not breach the Orders SLA.

**Negative:**
- A new service is permanently in the estate until the WMS is decommissioned.
- Fulfillment lag (Kafka consumer lag + WMS call latency) is a new observable concern.
- The gateway must handle WMS-specific error codes and retry semantics that no other service needs to understand.

---

## Exit Criteria

The Fulfillment Gateway is decommissioned when:
1. A modern Fulfillment service is built and validated against the WMS's functional contract.
2. The WMS vendor contract is not renewed.
3. The Fulfillment Gateway's Kafka consumer offset is replaced by the modern service's consumer group.

No changes to Orders, Inventory, or Customers are required when the gateway is decommissioned — only the consumer group is transferred.

---

## Related

- [ADR-0003](ADR-0003-strangler-fig-migration.md) — Strangler Fig for monolith extraction (contrast: gateway replaces, this pattern layers)
- [ADR-0004](ADR-0004-kafka-event-bus.md) — Kafka as the decoupling mechanism
- [ADR-0012](ADR-0012-circuit-breaker.md) — Circuit Breaker applied to the WMS SOAP call inside the gateway
- `contracts/slas/fulfillment-sla.yaml`
- `services/fulfillment-gateway/`
- `docs/migration/warehouse-leave-and-layer.md`
