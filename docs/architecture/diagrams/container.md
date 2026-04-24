# Container Diagram (C4 Level 2)

```mermaid
C4Container
    title Chakra Commerce — Containers

    Person(customer, "Customer")
    Person(ops, "Operator")

    System_Boundary(chakra, "Chakra Commerce Platform") {

        Container(gateway, "API Gateway", "Kong (DB-less)", "Strangler fig facade.\nRoutes traffic to monolith\nor new services by path prefix.\nEnforces rate limits and auth.")

        Container(monolith, "Legacy Monolith", "Java EE / WildFly", "Handles paths not yet\nextracted. Being retired\nphase by phase.")

        Container(orders, "Orders Service", "TypeScript / Fastify", "Event-sourced order lifecycle.\nPlace, confirm, cancel orders.\nPublishes domain events to Kafka.")

        Container(inventory, "Inventory Service", "TypeScript / Fastify", "CQRS stock management.\nReserves and releases stock.\nWrite: Postgres. Read: Redis.")

        Container(customers, "Customers Service", "TypeScript / Fastify", "Customer registration\nand account management.\nPostgreSQL-backed.")

        ContainerDb(orders_db, "Orders Event Store", "EventStoreDB", "Append-only event log\nfor the Orders domain.")

        ContainerDb(inventory_db, "Inventory DB", "PostgreSQL (RDS)", "Write model for\nstock levels and reservations.")

        ContainerDb(inventory_cache, "Inventory Read Cache", "Redis (ElastiCache)", "CQRS projection of\ncurrent stock levels.\nLow-latency reads.")

        ContainerDb(customers_db, "Customers DB", "PostgreSQL (RDS)", "Customer aggregates\nand address records.")

        Container(kafka, "Event Bus", "Apache Kafka (MSK)", "Async backbone.\nDecouples producers from consumers.\nAll domain events flow through here.")

        Container(otel_collector, "OTEL Collector", "OpenTelemetry Collector", "Receives OTLP from all services.\nBatches and exports to\nTempo / Loki / Mimir.")
    }

    System_Ext(payment, "Payment Gateway")
    System_Ext(grafana, "Grafana Stack")

    Rel(customer, gateway, "All API requests", "HTTPS")
    Rel(ops, otel_collector, "Observability signals", "Grafana")

    Rel(gateway, monolith, "Unextracted paths", "HTTP (internal)")
    Rel(gateway, orders, "/v1/orders/*", "HTTP (internal)")
    Rel(gateway, inventory, "/v1/inventory/*", "HTTP (internal)")
    Rel(gateway, customers, "/v1/customers/*", "HTTP (internal)")

    Rel(orders, orders_db, "Appends events,\nreads streams", "TCP")
    Rel(orders, kafka, "Publishes OrderPlaced,\nOrderConfirmed, OrderCancelled", "Kafka producer")

    Rel(inventory, inventory_db, "Writes reservations", "TCP")
    Rel(inventory, inventory_cache, "Reads stock levels", "Redis protocol")
    Rel(inventory, kafka, "Publishes StockReserved,\nStockReleased", "Kafka producer")
    Rel(kafka, inventory, "Consumes OrderPlaced\n(to trigger reservation)", "Kafka consumer")
    Rel(kafka, inventory_cache, "Updates read projection\non StockReserved/Released", "Kafka consumer")

    Rel(customers, customers_db, "Reads and writes\ncustomer aggregates", "TCP")
    Rel(customers, kafka, "Publishes CustomerRegistered,\nAddressUpdated", "Kafka producer")

    Rel(orders, payment, "Triggers payment capture", "HTTPS")

    Rel(orders, otel_collector, "Traces, metrics, logs", "OTLP gRPC")
    Rel(inventory, otel_collector, "Traces, metrics, logs", "OTLP gRPC")
    Rel(customers, otel_collector, "Traces, metrics, logs", "OTLP gRPC")
    Rel(gateway, otel_collector, "Traces, metrics, logs", "OTLP gRPC")
    Rel(otel_collector, grafana, "Remote write / push", "HTTPS")
```

## Traffic Routing During Migration

The Kong gateway is the strangler fig control plane. Traffic is routed by URL path prefix:

| Path prefix | Destination | Phase introduced |
|---|---|---|
| `/v1/customers/*` | Customers Service | Phase 2 |
| `/v1/inventory/*` | Inventory Service | Phase 3 |
| `/v1/orders/*` | Orders Service | Phase 4 (planned) |
| All other paths | Legacy Monolith | Phase 1 (until decommission) |

Canary weights are configurable in [`infrastructure/helm/charts/api-gateway/values-production.yaml`](../../infrastructure/helm/charts/api-gateway/values-production.yaml). A phase starts at 1% canary, ramps to 100% after SLA validation.
