# Contributing

This repo is structured around a strict separation between human-authored contracts and agent-built implementations. Understanding that separation is the prerequisite for contributing effectively.

---

## The Golden Rule

> `contracts/` is written by humans. Everything else can be built by agents.

A PR that modifies `contracts/slas/`, `contracts/domain-invariants/`, or `contracts/event-schemas/` requires a senior engineer review (see `CODEOWNERS`). These files encode business commitments and domain correctness — mistakes here propagate to every downstream artifact.

---

## How to Author a Contract

### Adding or changing an SLA (`contracts/slas/`)

1. Discuss the target with the relevant stakeholders. SLA changes affect error budgets and on-call load.
2. Edit the appropriate `*-sla.yaml` file. Follow the existing schema: `availability`, `latency_p99_ms`, `throughput_rps`, `error_budget_minutes_per_month`.
3. Run `tooling/validate-contracts.sh` to check that downstream artifacts are consistent.
4. If the SLA tightens (higher target), re-run `tooling/generate-prometheus-rules.py` to regenerate alerts, and update `observability/slos/` accordingly.
5. Open a PR. The description must include: the old target, the new target, and the operational justification.

### Adding a domain invariant (`contracts/domain-invariants/`)

1. Invariants are natural-language rules that the domain model must enforce. Write them as numbered, imperative rules.
2. Each invariant should be falsifiable: there must be a test that would fail if the invariant were violated.
3. Reference the invariant number in the corresponding domain model and test file.

### Adding an event schema (`contracts/event-schemas/`)

1. Event schemas are JSON Schema Draft 7 documents.
2. Field names use `camelCase`. All fields should have a `description`.
3. Adding a required field is a breaking change. Increment the schema version and create a migration path.
4. Run `tooling/validate-contracts.sh` to check that all typed event classes reference the new schema version.

---

## How to Write an Agent Task Spec (`ai-agents/tasks/`)

Task specs are how humans instruct agents. They are the interface between human intent and agent output. A well-written spec produces consistent, reviewable output. A vague spec produces drift.

A good task spec includes:

- **Goal**: one sentence describing the output artifact
- **Inputs**: explicit list of files the agent must read (use paths relative to repo root)
- **Output**: path(s) where the agent writes its output
- **Constraints**: rules from `ai-agents/context/` that apply
- **Acceptance criteria**: how to verify the output is correct (manual checklist or automated test)

See [`ai-agents/tasks/agent/implement-orders-service.md`](ai-agents/tasks/agent/implement-orders-service.md) for a reference example.

---

## How to Run a Script (`tooling/`)

Scripts are deterministic transformations. They do not require an agent invocation.

```bash
# Validate all contract coverage
./tooling/validate-contracts.sh

# Regenerate Prometheus alerts from SLO definitions
python3 tooling/generate-prometheus-rules.py

# Generate CI workflow for a new service
./tooling/generate-ci-workflow.sh <service-name> typescript

# Scaffold a new Helm chart from the service manifest
./tooling/generate-helm-boilerplate.sh <service-name>
```

Scripts are idempotent. Running them twice produces the same output. If they fail, the error message will point to the missing or malformed contract input.

---

## ADR Lifecycle

Architecture Decision Records (ADRs) follow the [MADR format](https://adr.github.io/madr/). An ADR moves through these statuses:

| Status | Meaning |
|---|---|
| `Draft` | Being written; not yet reviewed |
| `Proposed` | Ready for review; open for comment |
| `Accepted` | Decision made; implementation can proceed |
| `Superseded` | Replaced by a newer ADR (link to it) |
| `Deprecated` | Decision no longer applies; not replaced |

Every ADR must appear in [`docs/adrs/README.md`](docs/adrs/README.md). The `adr-lint` CI workflow checks this.

---

## PR Checklist

Before opening a PR, verify:

- [ ] `tooling/validate-contracts.sh` passes
- [ ] If modifying `contracts/`: stakeholder sign-off is noted in the PR description
- [ ] If adding a new service: `tooling/service-manifest.yaml` is updated
- [ ] If adding a new ADR: it appears in `docs/adrs/README.md`
- [ ] Mermaid diagrams render in GitHub preview
- [ ] CODEOWNERS coverage includes any new directories
