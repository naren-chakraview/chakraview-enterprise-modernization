---
title: How This Was Built
description: This project was built using the Chakraview AI Dev Model — a 6-persona workflow where humans author contracts and agents implement from them.
---

# How This Was Built

This project was built using the [Chakraview AI Dev Model](https://github.com/naren-chakraview/chakraview-ai-dev-model) — a 6-persona framework in which humans author contracts (SLAs, domain invariants, event schemas, ADRs) and AI agents implement from those contracts.

The line between what humans wrote and what agents built is structural: `contracts/` is human-only; `services/`, `infrastructure/`, and `observability/alerts/` are agent-built. This separation is enforced by `CODEOWNERS` and validated by `tooling/validate-contracts.sh` on every CI push.

---

## Who Produced What

| Persona | Type | What they produced in this project |
|---|---|---|
| 1 — Human Domain Expert | Human | `contracts/slas/*.yaml`, `contracts/domain-invariants/*.md`, `contracts/event-schemas/*.json`, `docs/adrs/` stubs, `ai-agents/tasks/` |
| 2 — Documentation Agent | LLM | Full ADRs (MADR format), `docs/ddd/orders/domain-model.md`, `docs/migration/strategy.md`, `docs/runbooks/sla-breach-response.md` |
| 3 — Script Authoring Agent | LLM (one-shot) | `tooling/generate-prometheus-rules.py`, `tooling/validate-contracts.sh` |
| 4 — Script Executor | Automation (CI) | `observability/slos/*.yaml`, `observability/alerts/*-burnrate.yaml` |
| 5 — Implementation Agent | LLM | `services/*/src/domain/`, `services/*/src/application/`, `services/*/src/infrastructure/`, `services/*/tests/domain/` |
| 6 — Compliance Agent | LLM (auditor) | `ai-agents/reviews/*-compliance-*.md` (one per Phase 4 and Phase 5 pass) |

---

## Walk-Through 1: The SLA → Alert Pipeline

The complete path from a human-written SLA target to a paging alert:

**Step 1 — Persona 1 writes `contracts/slas/orders-sla.yaml`:**
```yaml
service: orders
availability: 99.95%
latency_p99_ms: 500
throughput_rps: 1000
```

**Step 2 — Persona 3 writes `tooling/generate-prometheus-rules.py`** from the task spec at [`ai-agents/tasks/script/generate-prometheus-rules.md`](https://github.com/naren-chakraview/chakraview-enterprise-modernization/blob/main/ai-agents/tasks/script/generate-prometheus-rules.md). The script reads every `observability/slos/*.yaml` file and produces multi-window burn rate alert manifests.

**Step 3 — Persona 4 (GitHub Actions) runs the script** on every push that touches `contracts/slas/` or `observability/slos/`. Output: `observability/alerts/orders-burnrate.yaml` with fast-burn (page) and slow-burn (ticket) alerts.

**Step 4 — `tooling/validate-contracts.sh`** (also written by Persona 3) checks that every SLA has a matching SLO and a matching alert. CI fails if the chain is broken.

No alert was written by hand. No alert can exist without a human-authored SLA target.

---

## Walk-Through 2: The Orders Service Implementation

**Step 1 — Persona 1 authors:**
- `contracts/domain-invariants/orders-invariants.md` — 10 business rules the Orders aggregate must enforce
- `contracts/event-schemas/OrderPlaced.json`, `OrderCancelled.json` — canonical event shapes
- `docs/ddd/orders/` stub — aggregate structure and bounded context boundaries
- `ai-agents/tasks/agent/implement-orders-service.md` — the task spec

**Step 2 — Persona 2 (Documentation Agent)** expands the DDD stub into `docs/ddd/orders/domain-model.md` and `docs/ddd/orders/state-machine.md`. Human review gate: do the models faithfully express the invariants?

**Step 3 — Persona 5 (Implementation Agent)** reads all 9 input files listed in [`ai-agents/tasks/agent/implement-orders-service.md`](https://github.com/naren-chakraview/chakraview-enterprise-modernization/blob/main/ai-agents/tasks/agent/implement-orders-service.md) and produces the TypeScript domain, application, and infrastructure layers plus domain tests.

**Step 4 — Persona 6 (Compliance Agent)** runs the Phase 5 checklist against the produced code. See [`ai-agents/tasks/agent/architectural-compliance-review.md`](https://github.com/naren-chakraview/chakraview-enterprise-modernization/blob/main/ai-agents/tasks/agent/architectural-compliance-review.md) for the 15-item checklist. Output committed to `ai-agents/reviews/`.

**Step 5 — Human review gate:** does every invariant from `contracts/domain-invariants/orders-invariants.md` have a named test that would fail if the invariant were violated?

---

## Walk-Through 3: The ADR Workflow

**Step 1 — Persona 1** writes an ADR stub in `docs/adrs/`: the decision and the "why" in 3–5 paragraphs. The stub does not include alternatives considered or consequences — that's the agent's work.

**Step 2 — Persona 2 (Documentation Agent)** reads the stub, all previously accepted ADRs, and the relevant contracts, and produces the full MADR-format ADR: context, decision, consequences (positive and negative), and alternatives considered with rejection reasoning.

**Step 3 — Human review gate:** does the ADR correctly capture the decision? Are the alternatives honestly rejected? Do the consequences include negatives?

This project has 15 ADRs produced this way. Browse them at [`docs/adrs/`](adrs/README.md).

---

## The Task Specs

The actual task specs used to build this project live in [`ai-agents/tasks/`](https://github.com/naren-chakraview/chakraview-enterprise-modernization/tree/main/ai-agents/tasks). They are Chakra Commerce-specific — they name specific contracts, file paths, and acceptance criteria for this domain.

Generic, reusable templates for all task types are in the [Chakraview AI Dev Model repository](https://github.com/naren-chakraview/chakraview-ai-dev-model/tree/main/templates).
