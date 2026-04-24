# ADR-0009: Helm + ArgoCD for GitOps Delivery

**Status**: Accepted
**Date**: 2026-01-28

---

## Context

The team needed a deployment model where: (a) every deployed state is represented in Git, (b) AI agents can generate deployment manifests, (c) promotions between environments are explicit and auditable, and (d) rollbacks are fast and safe.

## Decision

Helm for packaging; ArgoCD for GitOps reconciliation. Each service has a Helm chart in `infrastructure/helm/charts/{service}/`. Environment-specific values are in `values-staging.yaml` and `values-production.yaml` (not `--set` overrides in CI). ArgoCD's app-of-apps pattern manages all services from a single root Application manifest.

## Rationale

**Helm charts are agent-generatable**: Given `tooling/service-manifest.yaml` and `ai-agents/context/infra-conventions.md`, an agent can produce a complete Helm chart. The output is deterministic and reviewable.
**Values files in Git**: `values-production.yaml` is a PR-reviewed artifact. Environment differences are visible in diffs, not buried in CI scripts.
**ArgoCD drift detection**: ArgoCD continuously compares cluster state to Git state. Drift is visible and alerts are configured.
**Rollback**: `argocd app rollback {app} {revision}` reverts to any previous Git revision in under 60 seconds.

## Consequences

**Positive**: Full deployment auditability; agent-generatable charts; fast safe rollbacks; drift detection.
**Negative**: Helm template complexity for advanced patterns (e.g., init containers); ArgoCD is a platform dependency that must itself be highly available.
