# Contracts

This directory is the **single source of truth for what the system must do**. Everything here is human-authored and requires senior engineer review to change.

Agents read these files. Agents do not write them.

---

## Structure

```
contracts/
├── slas/               Business commitments: availability, latency, throughput targets
├── domain-invariants/  Business rules that must never be violated
└── event-schemas/      Canonical JSON Schemas for every domain event
```

## Why Contracts Live Here

In a world where AI agents implement from specifications, the quality of the specification determines the quality of the output. A vague contract produces inconsistent implementations. A precise contract produces consistent, testable, auditable implementations.

Contracts are versioned in Git because:
- SLA changes are decisions that deserve a paper trail
- A diff on an invariant file shows exactly what business rule changed
- Agents can be given a specific git ref to implement against

## Downstream Impact

A change to any file in this directory cascades:

| Changed file | Downstream artifacts that must be regenerated |
|---|---|
| `slas/*.yaml` | `observability/slos/*.yaml`, `observability/alerts/*-burnrate.yaml` |
| `domain-invariants/*.md` | `services/*/src/domain/` (agent task re-run), `services/*/tests/` |
| `event-schemas/*.json` | `services/*/src/domain/events/` (typed classes), `api/asyncapi/` |

Run `tooling/validate-contracts.sh` after any change to verify coverage.
