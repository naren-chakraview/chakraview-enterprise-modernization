# Architecture Principles

These ten principles govern every decision in this repository. When a new decision conflicts with one of these, the principle wins — or an ADR is written to supersede it.

---

## 1. Contracts Before Code

No service, pipeline, or infrastructure component is built without a contract that defines what it must do. Contracts live in `contracts/` and include SLA targets, domain invariants, and event schemas. An implementation without a contract is a liability, not an asset.

*Enforced by: `tooling/validate-contracts.sh` fails CI if implementation exists without a corresponding contract.*

---

## 2. SLAs Are Code

Service Level Agreements are not wiki pages or slide decks. They are versioned YAML files in `contracts/slas/`, reviewed in PRs, and automatically translated into SLO definitions and Prometheus alerts. A change to an SLA target triggers a diff in alerts and dashboards.

*See: [ADR-0002](../adrs/ADR-0002-slo-as-code.md)*

---

## 3. Implementation Follows Contract Review

Contracts are reviewed and accepted before the first line of implementation begins. A partial contract — one still under discussion or missing invariants — is not a valid input to an implementation task. Parallel contract-and-implementation PRs couple two uncertainties; sequential review creates a clean separation between what the system must do and how it does it.

*How this was operationalised in this project: [How This Was Built](../how-this-was-built.md)*

---

## 4. Measure Before You Claim

No service ships without instrumentation that can prove it meets its SLA. `OtelInstrumentation.ts` in every service is not optional scaffolding — it registers the specific metrics, histograms, and traces required to evaluate SLO compliance. If you cannot query it, you cannot claim it.

*Enforced by: `ai-agents/context/observability-requirements.md` is a mandatory input for every service implementation task spec.*

---

## 5. Each Service Owns Its Data

No two services share a database, schema, or connection pool. A service's data store is an implementation detail. Integration happens through published events and versioned APIs. Shared databases create coupling that makes each service's SLA dependent on every other service's behavior.

*See: [ADR-0005](../adrs/ADR-0005-db-per-service.md)*

---

## 6. Events Are the System of Record for State Changes

Domain events are first-class artifacts. They are versioned in `contracts/event-schemas/`, documented in AsyncAPI specs, and typed in service code. An event that is not in the schema catalog does not exist. Events are immutable; compensating events are the mechanism for reversal.

*See: [ADR-0004](../adrs/ADR-0004-kafka-event-bus.md)*

---

## 7. Migration Is Always Reversible

Every phase of the strangler fig migration has a documented rollback procedure with explicit go/no-go criteria. No phase begins without the ability to return to the previous state. The cost of a careful rollback is far lower than the cost of a failed cutover without one.

*See: [docs/migration/strategy.md](../migration/strategy.md)*

---

## 8. Scripts Handle Transformation; Agents Handle Synthesis

Deterministic transformations (structured input → structured output) are scripted. Tasks requiring judgment, interpretation, or creativity are agent tasks. An agent that writes a script once produces more value than an agent that runs the same transformation a hundred times. Scripts are cheap, auditable, and fast; agent invocations are expensive and asynchronous.

*See: [ai-agents/README.md](../../ai-agents/README.md)*

---

## 9. Least Privilege Everywhere

Every service, every operator, every CI job has exactly the permissions it needs and nothing more. IAM roles are one-per-service, scoped to their specific AWS resources via IRSA. Kubernetes NetworkPolicies default to deny; every allowed path is explicit. PodSecurity admission is set to `restricted` on all namespaces.

*See: `infrastructure/terraform/policies/iam-least-privilege.tf`*

---

## 10. Boring Infrastructure, Interesting Domains

The platform layer (networking, compute, secrets, TLS, observability pipelines) uses established, well-understood tools with large support ecosystems. Architectural novelty is reserved for the domain: event sourcing for Orders, CQRS for Inventory. Spending innovation tokens on infrastructure means fewer tokens for the problems that create business value.

*See: [ADR-0009](../adrs/ADR-0009-helm-gitops.md)*
