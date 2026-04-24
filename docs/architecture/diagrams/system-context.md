# System Context Diagram (C4 Level 1)

```mermaid
C4Context
    title Chakra Commerce — System Context

    Person(customer, "Customer", "End user who places orders,\nmanages their account,\nand tracks deliveries")

    Person(ops, "Platform Operator", "Monitors service health,\nresponds to SLA alerts,\nmanages deployments via GitOps")

    Person(engineer, "Domain Engineer", "Authors contracts (SLAs, invariants,\nevent schemas), reviews\nagent-generated implementations")

    System(chakra, "Chakra Commerce Platform", "Handles order placement and lifecycle,\ninventory reservation, and customer\naccount management. Cloud-native on EKS.")

    System_Ext(payment, "Payment Gateway", "Stripe / Adyen\nCard authorization and capture")

    System_Ext(warehouse, "Warehouse System", "Legacy on-premises fulfillment.\nReceives OrderConfirmed events\nvia Kafka bridge.")

    System_Ext(grafana, "Grafana Observability Stack", "Grafana Cloud or self-hosted.\nTempo (traces), Loki (logs),\nMimir (metrics), Alertmanager.")

    System_Ext(argocd, "ArgoCD", "GitOps controller.\nSyncs Helm chart state from\nthis repo to EKS clusters.")

    Rel(customer, chakra, "Places orders, views history,\nmanages account", "HTTPS / REST")
    Rel(chakra, payment, "Authorizes and captures payments", "HTTPS")
    Rel(chakra, warehouse, "Publishes OrderConfirmed events", "Kafka (MSK)")
    Rel(chakra, grafana, "Emits traces, metrics, and logs", "OTLP gRPC")
    Rel(ops, grafana, "Reviews SLA dashboards,\nresponds to burn rate alerts")
    Rel(ops, argocd, "Triggers and approves deployments")
    Rel(argocd, chakra, "Reconciles desired Helm state", "Kubernetes API")
    Rel(engineer, chakra, "Authors contracts that\ndefine system behavior")
```

## Boundaries and Responsibilities

| Actor / System | Owns | Does not own |
|---|---|---|
| Chakra Commerce Platform | Order, Inventory, Customer domains | Payment processing, physical fulfillment |
| Payment Gateway | Card authorization and fraud | Order state, inventory |
| Warehouse System | Physical fulfillment execution | Stock levels (reads from Inventory via event) |
| Grafana Stack | Observability storage and alerting | Application logic, deployment |
| ArgoCD | Deployment reconciliation | Service implementation, config authoring |
| Domain Engineer | Contract correctness | Implementation volume |
| Platform Operator | Runtime SLA compliance | Contract authoring |
