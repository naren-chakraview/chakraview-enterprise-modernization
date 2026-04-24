# Agent Task: Implement Orders Service

**Task type**: Agent (LLM reasoning required)
**Spec version**: 1.2
**Last updated**: 2026-03-01
**Estimated tokens**: ~8,000 output

---

## Goal

Produce the TypeScript skeleton for the Orders service: domain layer, application layer, and infrastructure layer. The implementation must correctly express all business invariants and be wired for SLA measurement via OpenTelemetry.

---

## Inputs (read all of these before writing a single line)

| File | Why |
|---|---|
| `contracts/domain-invariants/orders-invariants.md` | Every invariant must be enforced in the aggregate |
| `contracts/event-schemas/OrderPlaced.json` | TypeScript event class must match this schema exactly |
| `contracts/event-schemas/OrderCancelled.json` | TypeScript event class must match this schema exactly |
| `contracts/slas/orders-sla.yaml` | Histogram bucket boundaries and metric names derived from this |
| `docs/ddd/orders/domain-model.md` | Aggregate structure, commands, state machine |
| `docs/ddd/orders/state-machine.md` | State transition guard logic |
| `api/openapi/orders-api-v1.yaml` | Route handler signatures must match this spec |
| `ai-agents/context/coding-standards.md` | All code must follow these standards |
| `ai-agents/context/observability-requirements.md` | Required metrics, traces, and logs |

---

## Outputs (produce exactly these files)

```
services/orders/src/
├── domain/
│   ├── Order.ts
│   ├── OrderItem.ts
│   ├── OrderStatus.ts
│   └── events/
│       ├── OrderPlaced.ts
│       ├── OrderConfirmed.ts
│       └── OrderCancelled.ts
├── application/
│   ├── PlaceOrderCommand.ts
│   ├── ConfirmOrderCommand.ts
│   └── CancelOrderCommand.ts
└── infrastructure/
    ├── OrderRepository.ts
    ├── KafkaEventPublisher.ts
    └── OtelInstrumentation.ts
services/orders/tests/domain/
    └── Order.test.ts
services/orders/Dockerfile
services/orders/package.json
```

---

## Constraints

1. **Typed events**: `OrderPlaced.ts` must implement a TypeScript interface that is structurally compatible with `contracts/event-schemas/OrderPlaced.json`. Use `zod` for runtime validation.
2. **Invariant enforcement**: Every invariant in `orders-invariants.md` must be enforced in the aggregate before any event is appended. Violations throw a named domain error class (e.g., `InvalidOrderTransitionError`).
3. **State machine**: `OrderStatus.ts` must implement the guard function from `docs/ddd/orders/state-machine.md`. No direct enum comparisons in aggregate methods — all transitions go through the guard.
4. **OTEL instrumentation**: `OtelInstrumentation.ts` must register:
   - `orders.request.duration` histogram with buckets at [50, 200, 500, 1000] ms (from SLA `latency_p99_ms: 500`)
   - `orders.errors.total` counter with `reason` label
   - `orders.saga.compensation.duration` histogram (from SLA `saga_compensation.max_compensation_latency_ms: 5000`)
5. **No I/O in domain layer**: `Order.ts`, `OrderItem.ts`, `OrderStatus.ts` must have zero imports from `infrastructure/`. Pure functions and classes only.
6. **Outbox pattern**: `KafkaEventPublisher.ts` must publish events read from an outbox table, not directly from the command handler.

---

## Acceptance Criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test -- tests/domain/Order.test.ts` passes (tests enforce all 10 invariants)
- [ ] `OtelInstrumentation.ts` imports only from `@opentelemetry/api`
- [ ] `tooling/validate-contracts.sh` passes (event class types match schema)
- [ ] No `any` types in domain layer
