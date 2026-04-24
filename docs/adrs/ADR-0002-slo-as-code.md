# ADR-0002: SLOs as Versioned Code

**Status**: Accepted
**Date**: 2026-01-15
**Deciders**: Platform Architect, SRE Lead

---

## Context

SLA targets were previously defined in a Confluence page titled "Platform SLOs" — last updated 18 months ago, no reviewer, no change history. The on-call Prometheus alerts used different thresholds than the Confluence page. The Grafana dashboards used a third set of numbers. When an incident occurred, there was genuine disagreement about whether the SLA had been breached.

Additionally: with AI agents generating observability artifacts (PrometheusRules, Grafana dashboards), there must be a machine-readable source of truth that agents can consume. A Confluence page is not that.

## Decision

SLA targets are defined as YAML files in `contracts/slas/`. These files are the single source of truth for all numeric SLA targets. SLO YAML files in `observability/slos/` are derived from them by script. PrometheusRule alert files are derived from SLO files by script. Grafana dashboards reference the same metric names and targets.

The derivation is explicit and automated:
```
contracts/slas/*.yaml
  → tooling/generate-prometheus-rules.py
    → observability/slos/*.yaml
    → observability/alerts/*-burnrate.yaml
```

The `tooling/validate-contracts.sh` script fails CI if any SLA file lacks a matching SLO and alert file.

## Rationale

**Single source of truth**: One file to update; all downstream artifacts regenerate automatically. No more drift between the "official" SLA and what Prometheus actually checks.

**Git history = audit trail**: Every SLA target change appears in git log with author, date, and PR link. This is the evidence required for compliance reviews.

**Machine-readable for agents**: Agents implementing services read `contracts/slas/` to know what metrics to register and what histogram bucket boundaries to use (e.g., an `orders.request.duration` histogram with a bucket at the `latency_p99_ms` target value).

**PR-gated changes**: A tighter SLA requires a PR with stakeholder sign-off. This prevents SLA targets from drifting quietly downward.

## Consequences

**Positive**:
- Observability artifacts are always consistent with stated SLA targets
- SLA changes are auditable and reviewable
- Agents can derive correct instrumentation from the SLA file

**Negative**:
- SLA changes require a git workflow, not a form or a meeting
- Teams must learn to express SLAs in YAML; initial onboarding cost

## Alternatives Considered

**Wikis / Confluence**: No machine readability, no diff, no review gate.

**Hardcoded in Prometheus config**: Alerts exist but targets are not visible to humans or agents as a named document.
