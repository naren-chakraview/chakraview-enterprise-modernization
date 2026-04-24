# ADR-0010: AI Agents as the Implementation Model

**Status**: Accepted
**Date**: 2026-02-01
**Deciders**: Engineering VP, Platform Architect, Domain Leads

---

## Context

As the engineering team scaled, a pattern emerged: senior engineers were spending 60–70% of their time on implementation tasks (writing boilerplate service code, Helm chart templates, CI pipelines, Prometheus alert YAML) rather than on design, contract authoring, and architectural judgment. The work was necessary but not differentiating. It was also repetitive and error-prone: a new service meant copying a Helm chart, adjusting values, hoping no file was missed.

At the same time, large language model coding agents reached a capability threshold where, given a sufficiently precise specification, they could produce implementation artifacts that were correct on first review. The key qualifier: *sufficiently precise specification*.

## Decision

We adopt a two-tier development model:

**Tier 1 — Human-authored contracts** (what the system must do):
- `contracts/slas/` — SLA targets
- `contracts/domain-invariants/` — business rules
- `contracts/event-schemas/` — event shapes
- `docs/adrs/` — architectural decisions
- `docs/ddd/` — bounded context models
- `ai-agents/tasks/` — task specifications for agents

**Tier 2 — Agent-built implementations** (how the system does it):
- `services/*/src/` — service code
- `infrastructure/` — Terraform, Helm, Kubernetes manifests
- `observability/alerts/` and `observability/dashboards/` — derived from SLO YAML
- `.github/workflows/` — CI pipelines

Additionally, we distinguish between tasks that require agent reasoning (synthesis, judgment) and tasks that are deterministic (transformation). Deterministic tasks are scripted; agents write the script once. Scripts live in `tooling/`.

## Why Agents, Not Just Scripts

Scripts handle *transformation*: structured input → structured output, no judgment required. Agents handle *synthesis*: natural-language intent + multiple inputs → correct, idiomatic, contextually appropriate output.

Writing a Helm chart `deployment.yaml` from a service manifest is transformation — scriptable. Writing the domain logic for `Order.place()` from `orders-invariants.md` is synthesis — agent required.

## Guardrails

This model only works with explicit guardrails:

1. **Contracts are immutable by agents**: CODEOWNERS maps `contracts/` to senior engineers. No agent PR may modify contracts.
2. **Contracts are complete before agents implement**: `tooling/validate-contracts.sh` fails if implementation exists without a corresponding contract.
3. **Agent output is reviewed like any code**: Agents produce PRs; humans review them. The review question is "does this correctly express the contract?" not "is this idiomatic code?"
4. **Instrumentation is contractual**: `ai-agents/context/observability-requirements.md` mandates that every service registers specific metrics. Agents cannot produce a service implementation without OTEL instrumentation.
5. **Task specs are versioned**: If the contracts change, the task spec is updated before the agent is re-run. The spec version is recorded in the agent task spec header.

## Consequences

**Positive**:
- Senior engineers focus on contract quality and architectural judgment — the highest-leverage work
- Implementation is consistent across services (agents follow the same standards every time)
- New services can be scaffolded in hours rather than days
- Onboarding is faster: read the contracts, understand the system

**Negative**:
- Contract authoring requires investment and skill development
- Agent output must still be reviewed; review is a different skill from writing
- Poorly specified contracts produce incorrect agent output; the model amplifies specification quality in both directions
- Some engineers resist the transition from "I write the code" to "I specify what the code must do"

## Alternatives Considered

**Pure scripting (no agents)**: Covers boilerplate but cannot handle domain logic. The domain logic is the irreducible complexity that requires understanding natural-language business rules.

**Traditional development (no agents)**: Valid, but wastes senior engineer time on low-judgment implementation tasks. The bottleneck is specification quality, not implementation volume.

**Full autonomy (agents without human contracts)**: Produces code that is locally coherent but globally inconsistent. Agents hallucinate domain behavior without invariants to constrain them. The quality floor is unacceptably low for production systems.
