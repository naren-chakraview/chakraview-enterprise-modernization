# The Human–AI Development Model

## The Core Idea

Modern software delivery faces a fundamental tension: the people who understand the business deeply (domain experts, architects, senior engineers) are not the bottleneck on *thinking* — they are the bottleneck on *typing*. AI agents can close that gap, but only if the division of responsibility is explicit and enforced.

This repo is built around one principle:

> **Humans are accountable for correctness. Agents are accountable for volume.**

Humans author *contracts* — the precise, versioned expression of business intent. Agents implement from those contracts. An agent that drifts from a contract produces a defect traceable to a missing or ambiguous contract, not to the agent itself.

---

## The Division of Responsibility

### What Humans Author

| Artifact | Location | Why a human, not an agent |
|---|---|---|
| SLA targets | `contracts/slas/` | Business commitment to users; requires stakeholder negotiation |
| Domain invariants | `contracts/domain-invariants/` | Business rules that encode years of operational learning |
| Event schemas | `contracts/event-schemas/` | The shared language between teams; breaking changes have production consequences |
| Architecture Decision Records | `docs/adrs/` | Tradeoff reasoning requires context, history, and judgment |
| Bounded context maps | `docs/ddd/` | Organizational and domain boundaries are political as much as technical |
| Migration phase docs | `docs/migration/` | Risk sequencing requires knowledge of operational constraints and team capacity |
| Agent task specs | `ai-agents/tasks/` | The spec is itself the human judgment artifact — it defines what "correct" means |
| `tooling/service-manifest.yaml` | `tooling/` | The authoritative list of services, their owners, and resource requirements |

### What AI Agents Build

| Artifact | Location | Input contracts |
|---|---|---|
| Service domain logic | `services/*/src/domain/` | `contracts/domain-invariants/`, `docs/ddd/` |
| Typed event classes | `services/*/src/domain/events/` | `contracts/event-schemas/` |
| Command handlers | `services/*/src/application/` | Domain models + API contracts |
| OTEL instrumentation | `services/*/src/infrastructure/OtelInstrumentation.ts` | `contracts/slas/` + `ai-agents/context/observability-requirements.md` |
| Helm chart templates | `infrastructure/helm/charts/` | `tooling/service-manifest.yaml` + `ai-agents/context/infra-conventions.md` |
| Terraform modules | `infrastructure/terraform/modules/` | Architecture decisions + infra conventions |
| CI/CD pipelines | `.github/workflows/` | Service manifest + coding standards |
| PrometheusRule alerts | `observability/alerts/` | `observability/slos/*.yaml` (derived from `contracts/slas/`) |
| Grafana dashboards | `observability/dashboards/` | SLO definitions + metric naming from OTEL requirements |
| Automation scripts | `tooling/*.py`, `tooling/*.sh` | Script task specs in `ai-agents/tasks/script/` |

---

## The Contract → Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│                    HUMAN LAYER                          │
│                                                         │
│  contracts/slas/orders-sla.yaml                         │
│  ┌─────────────────────────────────┐                    │
│  │ availability: 99.95%            │                    │
│  │ latency_p99_ms: 500             │                    │
│  │ throughput_rps: 1000            │                    │
│  └─────────────────────────────────┘                    │
│                   +                                     │
│  contracts/domain-invariants/orders-invariants.md       │
│  contracts/event-schemas/OrderPlaced.json               │
│  docs/ddd/orders/domain-model.md                        │
└──────────────────────┬──────────────────────────────────┘
                       │  consumed by
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   AGENT LAYER                           │
│                                                         │
│  ai-agents/tasks/agent/implement-orders-service.md      │
│  ai-agents/context/coding-standards.md                  │
│  ai-agents/context/observability-requirements.md        │
└──────────────────────┬──────────────────────────────────┘
                       │  produces
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 IMPLEMENTATION LAYER                    │
│                                                         │
│  services/orders/src/domain/Order.ts                    │
│  services/orders/src/domain/events/OrderPlaced.ts       │
│  services/orders/src/infrastructure/OtelInstrumentation │
│                                                         │
│  observability/slos/orders-slo.yaml                     │
│  observability/alerts/orders-burnrate.yaml              │
│  observability/dashboards/orders-service.json           │
└─────────────────────────────────────────────────────────┘
```

---

## When to Use an Agent vs. a Script

The boundary is: **does the task require judgment?**

### Use an AI Agent when:
- The input is natural language (invariants, ADR context, domain descriptions)
- The output requires interpretation, synthesis, or tradeoff reasoning
- Multiple inputs must be reconciled into a coherent whole
- The task would require a senior engineer to do well

### Use a Script when:
- The input is structured data (YAML, JSON)
- The transformation is deterministic and mechanical
- The output format is fixed and well-defined
- A diff on the script tells you exactly what changed and why

**Key insight**: agents write the scripts. The script runs ten thousand times; the agent runs once. This means agent time is spent on design and judgment; machine time is spent on execution and repetition.

See [`ai-agents/README.md`](../../ai-agents/README.md) for the full task inventory and routing guide.

---

## Guardrails

This model only works with guardrails that prevent agent drift from contracts.

| Guardrail | Mechanism |
|---|---|
| Event schema conformance | TypeScript types generated from JSON Schemas in `contracts/event-schemas/`; type errors = contract violations |
| SLA↔SLO traceability | `tooling/validate-contracts.sh` checks every SLA has a matching SLO definition and a burn rate alert |
| ADR coverage | `tooling/validate-contracts.sh` checks no service pattern is deployed that contradicts an accepted ADR |
| OTEL metric naming | `ai-agents/context/observability-requirements.md` mandates metric names; SLO queries depend on them |
| PR review | CODEOWNERS maps `contracts/` to senior engineers; no agent-initiated PR can modify contracts |

---

## How This Changes the Engineering Role

The team's most valuable time is spent on:

1. **Contract authoring** — writing precise, unambiguous SLAs and invariants
2. **ADR reasoning** — documenting architectural decisions so agents can implement consistently
3. **Agent task spec quality** — the more precise the spec, the better the output
4. **Contract review** — reviewing diffs to `contracts/` with the same rigor as production code changes
5. **SLA governance** — owning the dashboards that prove the system meets its commitments

Implementation becomes a review task, not a writing task. The engineer reads agent output and asks: *does this correctly express the contract?*
