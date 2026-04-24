# ADR-0001: Contract-First Development

**Status**: Accepted
**Date**: 2026-01-15
**Deciders**: Platform Architect, Engineering VP, Domain Leads

---

## Context

When AI agents generate implementation artifacts (service code, infrastructure, pipelines), the quality of the output is bounded by the quality of the input specification. Agents given vague or implicit requirements produce code that is locally coherent but globally inconsistent — methods that work but don't compose, services that behave correctly in isolation but violate domain invariants under load.

We also observed that without explicit contracts, the "what the system does" was scattered across: Jira tickets, Confluence pages, engineers' heads, and commit messages. When an agent (or a new engineer) needed to understand what correct behavior looked like, there was no authoritative source.

## Decision

We adopt a contract-first development model. Before any implementation artifact is created — code, infrastructure, CI pipeline — a contract must exist that defines what correct behavior looks like. Contracts are:

1. **SLA definitions** (`contracts/slas/`) — numeric commitments for availability, latency, and throughput
2. **Domain invariants** (`contracts/domain-invariants/`) — business rules the domain must never violate
3. **Event schemas** (`contracts/event-schemas/`) — the canonical shape of every domain event

Contracts are stored in `contracts/`, versioned in Git, and reviewed by senior engineers. No PR that creates an implementation artifact is mergeable if the corresponding contract does not exist.

## Rationale

**Contracts as the agent's spec**: An agent given `contracts/slas/orders-sla.yaml` + `contracts/domain-invariants/orders-invariants.md` + `docs/ddd/orders/domain-model.md` can produce an implementation that is verifiably correct against those inputs. Without those inputs, the agent produces its best guess, which drifts over iterations.

**Contracts as the review surface**: Reviewing a 500-line service implementation is hard. Reviewing a 50-line invariants document and then checking that the implementation expresses it is tractable. Contracts shift the review burden to where human judgment adds the most value.

**Contracts as the organizational interface**: When two teams integrate (Orders consuming Inventory's `StockReserved` event), the contract is the interface. Changing the contract is a negotiation; changing the implementation is a deployment.

## Consequences

**Positive**:
- Clear accountability: implementation correctness is traceable to a contract
- Agents produce more consistent output across sessions and across engineers
- New engineers and new agents can onboard by reading contracts, not reverse-engineering code

**Negative**:
- Upfront investment in writing contracts before writing code
- Contract authoring is a skill that must be developed and enforced
- Over-specified contracts can constrain legitimate implementation choices

## Alternatives Considered

**Specification via tests**: Tests can encode contracts, but they are written in the implementation language, require a running environment, and are harder to read by non-engineers. We use tests to *verify* contracts, not to *express* them.

**Specification via OpenAPI only**: OpenAPI captures the HTTP interface but not domain invariants or SLAs. It is necessary but not sufficient.
