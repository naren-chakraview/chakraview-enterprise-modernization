// State machine guard enforcing INV-ORD-003: valid status transitions only.
// All transitions go through assertValidTransition — no direct enum comparison in Order methods.

export enum OrderStatus {
  Pending = 'Pending',
  AwaitingPayment = 'AwaitingPayment',
  Confirmed = 'Confirmed',
  Cancelled = 'Cancelled',
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]:          [OrderStatus.AwaitingPayment, OrderStatus.Cancelled],
  [OrderStatus.AwaitingPayment]:  [OrderStatus.Confirmed, OrderStatus.Cancelled],
  [OrderStatus.Confirmed]:        [OrderStatus.Cancelled],
  [OrderStatus.Cancelled]:        [],
};

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`INV-ORD-003: Invalid transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
