# Design: Extract 6-Persona AI Dev Model to Its Own Repo

**Date**: 2026-04-30  
**Status**: Approved  
**Scope**: Create `chakraview-ai-dev-model`; refactor `chakraview-enterprise-modernization`

---

## Problem

The 6-persona Human-AI workflow is documented inside `chakraview-enterprise-modernization`, which conflates two distinct things: a reusable framework for AI-assisted development, and a case study in enterprise monolith modernization. Neither tells its story clearly because of the conflation. The framework cannot be referenced by other projects without pulling in Chakra Commerce context. The modernization repo reads as much about the dev model as about the modernization challenges it exists to document.

---

## Goal

- **`chakraview-ai-dev-model`**: A standalone, domain-generic framework repo. Covers the model (principle), the personas (who), the mechanism (contract boundaries), and the workflow (phases). No Chakra Commerce content.
- **`chakraview-enterprise-modernization`**: Focused on enterprise modernization challenges (strangler fig, DDD, SLA accountability, data consistency, legacy integration). Acknowledges it was built with the AI dev model via a dedicated case study section.

---

## New Repo: `chakraview-ai-dev-model`

### Repository Structure

```
chakraview-ai-dev-model/
├── README.md
├── docs/
│   ├── index.md                        # Model overview — the core claim
│   ├── model.md                        # The principle: humans for correctness, agents for volume
│   ├── personas/
│   │   ├── index.md                    # Overview table + Mermaid interaction map
│   │   ├── persona-1-human-domain-expert.md
│   │   ├── persona-2-documentation-agent.md
│   │   ├── persona-3-script-authoring-agent.md
│   │   ├── persona-4-script-executor.md
│   │   ├── persona-5-implementation-agent.md
│   │   └── persona-6-compliance-agent.md
│   ├── mechanism/
│   │   ├── index.md                    # Contract boundaries overview
│   │   ├── contracts.md                # What contracts are, why they are the boundary
│   │   ├── agent-vs-script.md          # Decision rule: synthesis vs. transformation
│   │   └── guardrails.md               # How to enforce the human/agent boundary
│   ├── workflow/
│   │   └── index.md                    # Complete 7-phase workflow (phases 0–7b), inline
│   ├── task-specs/
│   │   └── index.md                    # How to write a good task spec + compliance report format
│   └── case-studies/
│       └── index.md                    # Links to projects using this model
├── templates/
│   ├── agent-tasks/                    # Generic, parameterised task spec templates
│   │   ├── implement-service.md
│   │   ├── write-adr.md
│   │   ├── write-migration-phase.md
│   │   ├── write-runbook.md
│   │   └── compliance-review.md
│   ├── script-tasks/
│   │   ├── generate-alerts.md
│   │   ├── generate-helm.md
│   │   ├── generate-ci.md
│   │   └── validate-contracts.md
│   └── context/
│       ├── coding-standards.md
│       ├── infra-conventions.md
│       └── observability-requirements.md
├── mkdocs.yml
└── requirements-docs.txt
```

### Content Sources (from `chakraview-enterprise-modernization`)

| Source file | Destination in new repo | Transformation |
|---|---|---|
| `docs/architecture/human-ai-model.md` | `docs/model.md` + `docs/mechanism/` | Split: core principle → model.md; division of responsibility → contracts.md; guardrails → guardrails.md; agent-vs-script → agent-vs-script.md |
| `docs/architecture/agent-personas.md` | `docs/personas/persona-N-*.md` + `docs/workflow/index.md` | Split: each persona → own file; complete workflow diagram → workflow/index.md |
| `docs/adrs/ADR-0010-ai-agent-dev-model.md` | Absorbed into `docs/model.md` | Adapted — was a project ADR, becomes framework rationale prose |
| `ai-agents/tasks/agent/*.md` | `templates/agent-tasks/*.md` | Parameterised: replace Chakra Commerce specifics (service names, file paths) with `{placeholders}` |
| `ai-agents/tasks/script/*.md` | `templates/script-tasks/*.md` | Same parameterisation |
| `ai-agents/context/*.md` | `templates/context/*.md` | Same parameterisation |
| `docs/ai-agents/index.md` | Absorbed into `docs/index.md` and `docs/task-specs/index.md` | Content merged; the standalone index is not needed |

### README shape

- One-paragraph hook: the core claim (humans define correctness, agents handle volume)
- Quick-reference table: 6 personas at a glance
- Repo map
- "See it in practice" callout → `chakraview-enterprise-modernization`

### `case-studies/index.md`

Lists `chakraview-enterprise-modernization` as the reference implementation. Describes: what modernization challenge it addresses, what personas were used, link to its `docs/how-this-was-built.md`.

---

## Changes to `chakraview-enterprise-modernization`

### Files Removed

| File | Reason |
|---|---|
| `docs/architecture/human-ai-model.md` | Content moves to new repo |
| `docs/architecture/agent-personas.md` | Content moves to new repo |
| `docs/ai-agents/index.md` | Replaced by `docs/how-this-was-built.md` |
| `docs/adrs/ADR-0010-ai-agent-dev-model.md` | Framework-level decision; not a project architecture decision |

### Files Updated

**`docs/architecture/principles.md`** — Principle 3 rewritten:

- Old: "Humans Define Correctness; Agents Ensure Consistency" (frames the AI dev model)
- New: "Contract-First Implementation" — the principle that no service, pipeline, or infrastructure component is built without a contract. Framing is about the contracts, not the agent model. Cross-reference to `how-this-was-built.md` for how that was operationalised in this project.

**`README.md`** — "The Human–AI Development Model" section replaced by a single callout block:

> This project was built using the [Chakraview AI Dev Model](link) — a 6-persona workflow where humans author contracts and agents implement from them. See [How This Was Built](docs/how-this-was-built.md).

**`mkdocs.yml`** — Nav changes:
- Remove `Human-AI Model` and `Agent Personas` from Architecture section
- Remove `AI Agents` top-level nav section
- Add `How This Was Built: how-this-was-built.md` under a new top-level nav entry

**`docs/index.md`** (MkDocs homepage) — Two sections updated:
- "6 AI Agent Personas" card → replaced with a "How This Was Built" card linking to `how-this-was-built.md`
- "The Human–AI Boundary" code block section → replaced with a "The Modernization Challenge" section that summarises the enterprise challenges this case study addresses (strangler fig, SLA accountability, data consistency, legacy integration)

**`README.md`** — Additionally, the "Key Architectural Decisions" table currently lists ADR-0010. That row is removed. The table retains ADRs 0001–0009, 0011–0015.

**`ai-agents/README.md`** — Header note added:

> These are the Chakra Commerce-specific task specs used to build this project. Generic, reusable templates live in [chakraview-ai-dev-model/templates](link).

### File Added

**`docs/how-this-was-built.md`** — Case study section. Structure:

1. One-paragraph intro: this project used the Chakraview AI Dev Model; link to new repo
2. Table: Persona → Artifact produced → Source contract (all 6 personas, concrete examples from this repo)
3. Three concrete walk-throughs:
   - The SLA→Alert pipeline: Persona 1 authors `contracts/slas/orders-sla.yaml` → Persona 3 writes `tooling/generate-prometheus-rules.py` → Persona 4 runs it → `observability/alerts/orders-burnrate.yaml`
   - The Orders service: Persona 1 authors invariants + event schemas → Persona 2 writes domain model → Persona 5 implements `services/orders/src/` → Persona 6 reviews compliance
   - The ADR workflow: Persona 1 stubs context → Persona 2 produces full MADR → Human review gate
4. Link to `ai-agents/tasks/` for the actual task specs used in this project

### `ai-agents/` Directory

Stays intact. All Chakra Commerce-specific task specs remain as project artifacts and serve as evidence for the case study section.

---

## Cross-Reference Contract

| Direction | Mechanism | Location |
|---|---|---|
| New repo → Enterprise-mod | Link in `case-studies/index.md` | "See it in practice: chakraview-enterprise-modernization" |
| Enterprise-mod → New repo | Callout in README | One line, with link |
| Enterprise-mod → New repo | Links in `how-this-was-built.md` | Per-persona links to persona definition pages |
| Enterprise-mod → New repo | Note in `ai-agents/README.md` | "Generic templates live in…" |

No content is duplicated across repos. Framework docs live exclusively in the new repo. Chakra Commerce-specific content lives exclusively in enterprise-mod.

---

## Out of Scope

- Building a GitHub Pages site for the new repo (can follow once content is in place)
- Migrating git history from enterprise-mod into the new repo
- Changes to any other portfolio repos

---

## Success Criteria

1. `chakraview-ai-dev-model` is a complete, self-contained repo: someone who has never seen enterprise-mod can read the framework and understand the model, personas, mechanism, and workflow.
2. `chakraview-enterprise-modernization` contains no workflow framework docs. A reader focused on modernization challenges is never pulled into AI model detail unless they choose to follow the "How This Was Built" link.
3. The two repos are linked but not coupled — neither embeds content from the other.
4. All templates in the new repo are domain-generic (no Chakra Commerce references).
