# Script Task: Generate Prometheus Burn Rate Alerts

**Task type**: Script (deterministic transformation)
**Script to produce**: `tooling/generate-prometheus-rules.py`
**Runs in**: GitHub Actions CI (`adr-lint.yml`), manually by engineers

---

## Purpose

Transform SLO definition YAML files into Kubernetes PrometheusRule manifests using Google's multi-window burn rate alerting model. This transformation is purely mechanical — no judgment required — so it should be a script, not an agent invocation.

---

## Input Schema

Reads all `observability/slos/*.yaml` files. Each file has this shape:

```yaml
service: orders
window_days: 30
availability:
  target: 0.9995
  metric: orders_requests_total
  error_metric: orders_errors_total
latency:
  target_p99_ms: 500
  histogram_metric: orders_request_duration_seconds
```

---

## Output

For each input SLO file, produces `observability/alerts/{service}-burnrate.yaml`. Example output structure:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: orders-slo-burnrate
  namespace: chakra-platform
spec:
  groups:
    - name: orders.slo.burnrate
      rules:
        # Fast burn: page immediately (budget gone in < 2 days at this rate)
        - alert: OrdersSLOFastBurn
          expr: |
            (
              sum(rate(orders_errors_total[1h])) /
              sum(rate(orders_requests_total[1h]))
            ) > (14.4 * 0.0005)
          for: 2m
          labels:
            severity: page
            service: orders
          annotations:
            summary: "Orders SLO fast burn rate: error budget depleting rapidly"
            runbook_url: "docs/runbooks/sla-breach-response.md"
        # Slow burn: ticket (budget gone in < 5 days)
        - alert: OrdersSLOSlowBurn
          expr: |
            (
              sum(rate(orders_errors_total[6h])) /
              sum(rate(orders_requests_total[6h]))
            ) > (6 * 0.0005)
          for: 15m
          labels:
            severity: ticket
            service: orders
```

---

## Algorithm

```
for each slos/*.yaml:
  error_rate_threshold = 1 - availability.target
  fast_burn_factor = 14.4   # budget exhausted in 30d/14.4 = 2.08 days
  slow_burn_factor = 6      # budget exhausted in 30d/6 = 5 days

  emit PrometheusRule with:
    - fast burn alert: 1h window, factor=14.4, severity=page
    - slow burn alert: 6h window, factor=6, severity=ticket
    - latency alert: histogram_quantile(0.99, ...) > target_p99_ms/1000
```

---

## Idempotency

Running the script twice produces identical output. If an SLO file has not changed since the last run, the corresponding alert file is unchanged (bit-for-bit identical, enabling git diff checks in CI).

---

## Acceptance Criteria

- [ ] Script runs with `python3 tooling/generate-prometheus-rules.py` from repo root
- [ ] Produces one output file per input SLO file
- [ ] Output is valid YAML (parseable by `pyyaml`)
- [ ] Output is a valid PrometheusRule (validate with `kubeval` or `promtool`)
- [ ] Idempotent: running twice produces identical output
- [ ] Exits non-zero if any SLO file is malformed
