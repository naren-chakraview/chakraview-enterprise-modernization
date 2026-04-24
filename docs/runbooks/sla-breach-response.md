# Runbook: SLA Breach Response

**Severity**: P1 (fast burn) / P2 (slow burn)
**Alert**: `*FastBurn` (severity: page) / `*SlowBurn` (severity: ticket)

---

## What Fired

A burn rate alert means error budget is being consumed faster than the allocation rate. The alert name tells you:
- Which service (`Orders`, `Inventory`, `Customers`)
- Which SLO dimension (`Availability` or `Latency`)
- Which tier (`FastBurn` = pages now / `SlowBurn` = fix today)

| Alert tier | Burn rate | Budget exhaustion | Action |
|---|---|---|---|
| FastBurn | 14.4× | ~2 days | Page on-call; begin incident response immediately |
| SlowBurn | 6× | ~5 days | Create P2 ticket; fix before budget exhausts |

---

## Step 1: Assess Scope (5 minutes)

Open the [SLA Executive Dashboard](https://grafana.chakracommerce.internal/d/sla-executive-dashboard).

Answer these questions:
1. Is this a single service or multiple services?
2. Is the burn rate still rising, stable, or recovering?
3. What is the remaining error budget percentage?

If multiple services are breaching simultaneously → suspect platform (EKS node failure, MSK outage, network). Jump to **Platform Triage**.

---

## Step 2: Identify the Cause Category

### Availability breach (5xx rate elevated)

Check in order:
1. **Recent deployment?** Check ArgoCD sync history. If yes → [rollback deployment](rollback-deployment.md).
2. **Kafka consumer lag elevated?** Check [kafka-overview dashboard](https://grafana.chakracommerce.internal/d/kafka-overview). If yes → [kafka lag runbook](kafka-consumer-lag.md).
3. **Database failover in progress?** Check RDS event log. If yes → [database failover runbook](database-failover.md).
4. **Pod crash loops?** `kubectl get pods -n chakra-{service} | grep -v Running`. If yes → check logs: `kubectl logs -n chakra-{service} deploy/{service}`.
5. **Upstream external service?** Check Payment Gateway status page. If yes → escalate to vendor; update stakeholders.

### Latency breach (p99 > SLA target)

Check in order:
1. **Database query regression?** Check Grafana slow query panel (Postgres Insights).
2. **Redis eviction?** Check `inventory_projection_lag_seconds` metric. If lag > 500ms → Redis memory pressure.
3. **JVM / Node GC pressure?** Check heap metrics in the service dashboard.
4. **Upstream timeout?** Check saga duration histogram. If `orders_saga_duration_seconds` p99 increased → suspect Inventory or Payment Gateway.

---

## Step 3: Mitigate

| Root cause | Mitigation |
|---|---|
| Bad deployment | [rollback-deployment.md](rollback-deployment.md) |
| DB failover | [database-failover.md](database-failover.md) |
| Kafka lag | [kafka-consumer-lag.md](kafka-consumer-lag.md) |
| External service outage | Enable circuit breaker; update status page; escalate to vendor |
| Pod crash loops | Scale down to 1 replica; inspect logs; fix and redeploy |
| Memory pressure | Scale horizontally (HPA); check for cardinality explosion in metrics |

---

## Step 4: Verify Recovery

- Burn rate alert must resolve (no longer firing) for 15 minutes before declaring mitigation complete
- Check that `error_budget_remaining` is no longer decreasing
- If budget < 20% remaining: notify engineering VP; consider feature freeze until budget recovers

---

## Step 5: Post-Incident

1. Open a post-incident review (PIR) document within 24 hours
2. Update the appropriate runbook with any new findings
3. If the breach was caused by a missing alert or monitoring gap → create a ticket to close the gap before closing the PIR
4. Update SLA target if the incident revealed the target is unachievable with current architecture

---

## Escalation

| Condition | Escalate to |
|---|---|
| Budget < 10% remaining | Engineering VP + Domain Lead |
| Multiple services breaching simultaneously | Incident Commander; declare P0 |
| Payment Gateway outage > 30 min | Vendor SLA claim process (see `contracts/slas/orders-sla.yaml` exclusions) |
