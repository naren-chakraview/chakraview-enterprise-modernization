# Warehouse Integration: Leave-and-Layer Migration

## Pattern Summary

The Chakra Commerce Warehouse Management System (WMS) is an on-premises vendor product that cannot be modified. Rather than building a modern replacement in parallel with the Orders extraction, we apply the **Leave-and-Layer** pattern:

- **Leave**: The WMS operates exactly as it did under the monolith. Its SOAP API, deployment, and vendor contract are untouched.
- **Layer**: A new **Fulfillment Gateway** service sits between the Kafka event bus and the WMS. It subscribes to `OrderConfirmed` events and translates them into WMS fulfillment requests.

This is not a migration toward a new warehouse system. It is an interface modernization. The WMS remains the system of record for physical fulfillment until a future initiative replaces it.

---

## Architecture

```
Orders service
    │
    │  publishes OrderConfirmed
    ▼
Kafka topic: chakra.orders.confirmed
    │
    │  consumer group: fulfillment-gateway
    ▼
Fulfillment Gateway (new service)
    │
    │  translates domain event → WMS dispatch request
    │  SOAP/HTTP with circuit breaker + retry
    ▼
Warehouse Management System (untouched legacy)
```

The Orders service does not know the WMS exists. It publishes a domain event and its responsibility ends. The Fulfillment Gateway owns the WMS integration concern entirely.

---

## Deployment Phases

### Phase A — Gateway deployed alongside monolith

1. Deploy Fulfillment Gateway to `chakra-fulfillment` namespace.
2. Gateway consumer group `fulfillment-gateway` starts from the latest Kafka offset.
3. The monolith continues to call the WMS directly via its existing integration path.
4. **Both paths active in parallel** — this is intentional. Duplicate fulfillment requests to WMS are idempotent (WMS deduplicates on order ID).
5. Validate: Kafka consumer lag stays below 30 seconds; WMS receives gateway-originated calls; circuit breaker remains closed.

### Phase B — Monolith fulfillment path disabled

Prerequisite: Gateway has been stable (P99 < 2000ms, availability > 99.9%) for 14 days.

1. Disable the monolith's WMS integration in Kong routing config (one-line change).
2. All fulfillment flow now runs through the Fulfillment Gateway only.
3. Validate: WMS call volume matches order confirmation rate; no fulfillment lag alerts firing.

### Phase C — Orders extraction complete (Phase 4)

When the Orders service is extracted from the monolith:
- No changes to the Fulfillment Gateway are required.
- The gateway consumes from the same Kafka topic. The producer changes from monolith to Orders service; the consumer sees no difference.

---

## Rollback

| Phase | Rollback action | Time to effect |
|---|---|---|
| Phase A | Stop Fulfillment Gateway; monolith path already active | < 1 minute |
| Phase B | Re-enable monolith WMS integration in Kong config | < 2 minutes |
| Phase C | No rollback needed; gateway is unchanged by Orders extraction |

---

## Failure Modes

| Failure | Gateway behavior | WMS impact |
|---|---|---|
| WMS SOAP timeout | Retry with exponential backoff (3 attempts, max 30s) | WMS receives up to 3 attempts; deduplicates on order ID |
| WMS returns 5xx | Circuit breaker opens after 5 consecutive failures; events accumulate in Kafka | No WMS calls during open window (30s); consumer lag alert fires |
| Fulfillment Gateway pod crash | Kafka offset not committed; events replayed on restart | Duplicate call possible; WMS deduplicates |
| Kafka broker unavailable | Gateway cannot consume; no WMS calls | No fulfillment lag; alert fires at 30s consumer lag threshold |

---

## SLA Relationship

The Fulfillment Gateway has its own SLA (`contracts/slas/fulfillment-sla.yaml`) that is independent of the Orders SLA. A WMS outage that causes the gateway circuit breaker to open:
- **Does not breach the Orders SLA** — order placement and confirmation continue normally.
- **Does breach the Fulfillment SLA** — fulfillment dispatch success rate drops.

This separation is intentional. The leave-and-layer boundary isolates WMS unreliability from the core commerce platform SLAs.

---

## Exit Criteria

The Fulfillment Gateway is decommissioned when:

1. A modern Fulfillment service (with its own persistence, domain model, and SLA) is validated against the WMS functional contract.
2. The modern service's consumer group takes over the `chakra.orders.confirmed` topic.
3. The WMS vendor contract is allowed to lapse or the WMS is decommissioned.

No changes are required in Orders, Inventory, or Customers when the gateway exits.
