# Architecture Decision Records

This directory contains all ADRs for the Chakra Commerce modernization. ADRs follow the [MADR format](https://adr.github.io/madr/).

## Status Legend

| Status | Meaning |
|---|---|
| `Accepted` | Decision in effect; implementation follows this decision |
| `Superseded` | Replaced by a newer ADR (linked in the body) |
| `Deprecated` | Decision no longer applies; no replacement |

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-0001](ADR-0001-contract-first-development.md) | Contract-First Development | Accepted |
| [ADR-0002](ADR-0002-slo-as-code.md) | SLOs as Versioned Code | Accepted |
| [ADR-0003](ADR-0003-strangler-fig-migration.md) | Strangler Fig Migration Pattern | Accepted |
| [ADR-0004](ADR-0004-kafka-event-bus.md) | Apache Kafka as the Event Bus | Accepted |
| [ADR-0005](ADR-0005-db-per-service.md) | Database per Service | Accepted |
| [ADR-0006](ADR-0006-event-sourcing-orders.md) | Event Sourcing for the Orders Domain | Accepted |
| [ADR-0007](ADR-0007-cqrs-inventory.md) | CQRS for the Inventory Domain | Accepted |
| [ADR-0008](ADR-0008-opentelemetry.md) | OpenTelemetry as the Instrumentation Standard | Accepted |
| [ADR-0009](ADR-0009-helm-gitops.md) | Helm + ArgoCD for GitOps Delivery | Accepted |
| [ADR-0010](ADR-0010-ai-agent-dev-model.md) | AI Agents as the Implementation Model | Accepted |
| [ADR-0011](ADR-0011-leave-and-layer-warehouse.md) | Leave-and-Layer Pattern for Warehouse Integration | Accepted |
| [ADR-0012](ADR-0012-circuit-breaker.md) | Circuit Breaker for External Dependency Calls | Accepted |
| [ADR-0013](ADR-0013-bulkhead-isolation.md) | Bulkhead Isolation | Accepted |
| [ADR-0014](ADR-0014-sidecar-mesh.md) | Sidecar Pattern for Cross-Cutting Infrastructure Concerns | Accepted |
| [ADR-0015](ADR-0015-choreography-events.md) | Choreography for Downstream Event Reactions | Accepted |
