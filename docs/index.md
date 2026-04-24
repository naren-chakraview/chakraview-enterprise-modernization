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

-   :material-robot-outline:{ .lg .middle } __6 AI Agent Personas__

    ---

    Human Domain Expert, Documentation Agent, Script Authoring Agent, Script Executor, Implementation Agent, and Architectural Compliance Agent — each with explicit inputs, outputs, and constraints.

    [:octicons-arrow-right-24: Understand the AI Model](ai-agents/index.md)

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

## The Human–AI Boundary

```
Human authors                    AI agents build
─────────────────────────        ─────────────────────────────────
contracts/slas/*.yaml        →   observability/slos/*.yaml
contracts/slas/*.yaml        →   observability/alerts/*-burnrate.yaml
contracts/event-schemas/     →   services/*/src/domain/events/*.ts
contracts/domain-invariants/ →   services/*/src/domain/ (aggregates, guards)
docs/adrs/                   →   services/ + infrastructure/
ai-agents/tasks/agent/       →   everything in services/, infrastructure/
```

This is not automation for its own sake. It is a deliberate separation: **humans hold accountability for correctness; agents handle volume and consistency.**

[:octicons-arrow-right-24: Read the Human-AI Model](architecture/human-ai-model.md)

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
