---
title: Chakra Commerce — Enterprise Modernization
description: A reference architecture for modernizing enterprise monoliths, where humans define correctness and AI agents implement from contracts.
tags:
  - overview
---

# Chakra Commerce — Enterprise Modernization

> A reference architecture for modernizing enterprise monoliths to cloud-native microservices — where **humans define what correct looks like** and **AI agents do the building**.

---

## The Thesis

Most modernization projects fail at one of two places: they either begin implementation before the domain is understood, or they distribute domain knowledge across PRs and conversations where it can't be consumed systematically.

This reference architecture inverts both problems.

**Humans author contracts** — precise, versioned specifications of SLAs, business invariants, and event schemas. These live in `contracts/` and are the only source of truth the system ever needs to trust.

**AI agents implement from those contracts** — every service skeleton, Helm chart, CI pipeline, and Prometheus alert is derivable from the contracts by an agent given a task spec. The line between what humans wrote and what agents built is explicit and structural.

**SLA measurement is woven in from day one** — not added after the fact. Every SLA target in `contracts/slas/` flows through a deterministic script to `observability/slos/` and `observability/alerts/`. The first commit includes the alert that would page on-call if the SLA were breached.

---

## At a Glance

<div class="grid cards" markdown>

-   :material-swap-horizontal:{ .lg .middle } __10 Architecture Patterns__

    ---

    From Strangler Fig migration to Leave-and-Layer, Event Sourcing, CQRS, Saga Orchestration, Choreography, Circuit Breaker, Bulkhead, Sidecar, and Outbox — each backed by an ADR.

    [:octicons-arrow-right-24: Browse the Pattern Catalogue](patterns/index.md)

-   :material-file-document-check:{ .lg .middle } __15 Architecture Decision Records__

    ---

    Every architectural choice is an accepted ADR with context, decision, consequences, and cross-references. No decisions in Slack threads or wikis.

    [:octicons-arrow-right-24: Browse ADRs](adrs/README.md)

-   :material-hammer-wrench:{ .lg .middle } __How This Was Built__

    ---

    All 6 AI dev model personas — Human Domain Expert, Documentation Agent, Script Authoring Agent, Script Executor, Implementation Agent, and Compliance Agent — contributed to this project. See the full breakdown.

    [:octicons-arrow-right-24: How This Was Built](how-this-was-built.md)

-   :material-chart-line:{ .lg .middle } __SLA → Alert in one pipeline__

    ---

    A YAML file in `contracts/slas/` is the only place a target is written. A deterministic script derives SLO definitions and multi-window burn rate alerts. 20/20 coverage checks pass in CI.

    [:octicons-arrow-right-24: See the SLA Pipeline](observability/index.md)

</div>

---

## The Modernization Journey

Chakra Commerce began as a Java EE monolith. The modernization extracts one bounded context at a time using the Strangler Fig pattern, never pausing the business.

| Phase | What changes | Key pattern | Status |
|---|---|---|---|
| 1 — Facade | Kong deployed in front of monolith | Strangler Fig | Done |
| 2 — Customers | Customers service extracted | Strangler Fig + CDC | Done |
| 3 — Inventory | Inventory extracted with CQRS | Strangler Fig + CDC + CQRS | In progress |
| 4 — Orders | Orders extracted with event sourcing | Event Sourcing + Saga | Planned |
| 5 — Decommission | Monolith retired | — | Planned |

The Warehouse Management System runs in parallel throughout — never modified, accessed via a [Leave-and-Layer](patterns/index.md#leave-and-layer) proxy.

[:octicons-arrow-right-24: Read the full migration strategy](migration/strategy.md)

---

## The Modernization Challenge

Chakra Commerce represents a class of enterprise problem found in nearly every organisation that built software between 2000 and 2015: a monolith that was the right choice at the time, now limiting the team's ability to move independently, measure reliability, or scale specific workloads.

This reference architecture addresses four specific challenges:

- **Extraction without downtime**: The strangler fig pattern lets each bounded context go live independently, with the monolith continuing to serve traffic throughout.
- **SLA accountability during migration**: SLA targets are defined before extraction begins. Every migration phase has observable go/no-go criteria tied to those SLAs.
- **Data consistency across split storage**: CDC pipelines and the event bus replace the shared database as the integration mechanism between newly extracted services.
- **Legacy system integration**: The Leave-and-Layer pattern keeps the on-premises Warehouse Management System untouched while the rest of the architecture modernises around it.

[:octicons-arrow-right-24: Read the full migration strategy](migration/strategy.md)

---

## Repository Structure

```
contracts/          Human-authored source of truth: SLAs, invariants, event schemas
docs/               Architecture docs, ADRs, DDD models, migration plans, runbooks
ai-agents/          Task specs for LLM agents and deterministic scripts
services/           TypeScript service skeletons built from contracts/ by AI agents
infrastructure/     Terraform modules, Helm charts, Kubernetes manifests
observability/      SLO definitions, burn-rate alerts, Grafana dashboards, OTEL config
tooling/            Scripts that transform structured inputs into artifacts
api/                OpenAPI 3.1 + AsyncAPI 3.0 contracts
```

!!! tip "Browse the source"
    Every page in this documentation links to the relevant source files in the [GitHub repository](https://github.com/naren-chakraview/chakraview-enterprise-modernization).
