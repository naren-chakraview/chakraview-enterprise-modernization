# AI Agent Framework

Six personas participate in this workflow. This directory holds the task specifications, context documents, and compliance review artifacts for all of them. Full persona definitions and the complete workflow: [`docs/architecture/agent-personas.md`](../docs/architecture/agent-personas.md).

```
ai-agents/
├── tasks/
│   ├── agent/    LLM tasks: implementation, documentation, compliance review
│   └── script/   Deterministic task specs: structured input → structured output
├── context/      Standards every agent must follow
└── reviews/      Compliance reports produced by Persona 6 (Architectural Compliance Agent)
```

---

## When to Use an Agent vs. a Script

**Use an agent when the task requires:**
- Understanding natural language (business rules, invariants, ADR rationale)
- Synthesizing multiple inputs into a coherent whole
- Making judgment calls (naming, tradeoffs, idiomatic patterns)
- Producing output that a senior engineer would need to *think* to write

**Use a script when the task is:**
- A deterministic transformation of structured data (YAML → YAML, manifest → file tree)
- Repeatable and idempotent with no judgment required
- Fast enough that running it on every CI push is acceptable

**The meta-rule**: Agents write the scripts. A script is an agent's judgment, crystallized and made reproducible. The agent runs once to produce the script; the script runs forever.

---

## Agent Tasks (`tasks/agent/`)

These tasks require an LLM. Each file is a self-contained task spec:

| Task Spec | Persona | What the agent produces |
|---|---|---|
| `implement-orders-service.md` | 5 — Implementation | `services/orders/src/` — domain, application, infrastructure layers |
| `implement-inventory-service.md` | 5 — Implementation | `services/inventory/src/` |
| `implement-customers-service.md` | 5 — Implementation | `services/customers/src/` |
| `write-adr.md` | 2 — Documentation | A new ADR in `docs/adrs/` |
| `write-migration-phase.md` | 2 — Documentation | A migration phase doc in `docs/migration/` |
| `write-runbook.md` | 2 — Documentation | A runbook in `docs/runbooks/` |
| `architectural-compliance-review.md` | 6 — Compliance | A report in `ai-agents/reviews/` after Phase 4 or Phase 5 |

---

## Script Tasks (`tasks/script/`)

These tasks are deterministic. The spec describes what a script must do; the agent writes the script once; the script runs in CI.

| Task Spec | Script produced | Input → Output |
|---|---|---|
| `generate-prometheus-rules.md` | `tooling/generate-prometheus-rules.py` | `observability/slos/*.yaml` → `observability/alerts/*-burnrate.yaml` |
| `generate-helm-boilerplate.md` | `tooling/generate-helm-boilerplate.sh` | `tooling/service-manifest.yaml` → `infrastructure/helm/charts/{svc}/` |
| `generate-ci-workflow.md` | `tooling/generate-ci-workflow.sh` | Service name + language → `.github/workflows/ci-{svc}.yaml` |
| `validate-contracts.md` | `tooling/validate-contracts.sh` | Repo state → pass/fail with errors |

---

## Context Documents (`context/`)

Every agent task spec references one or more of these. They define the non-negotiable standards that apply across all agent-built artifacts.

| Document | What it constrains |
|---|---|
| `coding-standards.md` | TypeScript style, error handling, naming, file structure |
| `infra-conventions.md` | Terraform module structure, Helm conventions, naming |
| `observability-requirements.md` | Required metrics, trace span names, log fields for every service |

An agent that ignores these documents produces output that will be rejected in code review.

---

## How to Write a Good Task Spec

A task spec is the interface between human intent and agent output. It must be:

1. **Self-contained**: The agent reads only the files listed in the spec. Do not assume the agent has context from previous runs.
2. **Explicit about inputs**: List every file the agent must read, with repo-relative paths.
3. **Explicit about outputs**: Specify every file the agent must produce, with expected paths.
4. **Acceptance-criteria-driven**: List the checks the agent output must pass (unit tests, type checks, validate-contracts.sh).
5. **Standards-referenced**: Name which `context/` documents apply.

See `tasks/agent/implement-orders-service.md` for a reference example.
