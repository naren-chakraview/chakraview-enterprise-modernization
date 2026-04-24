// Agent-generated from:
//   contracts/domain-invariants/orders-invariants.md
//   docs/ddd/orders/domain-model.md
//   contracts/event-schemas/OrderPlaced.json

import { OrderItem } from './OrderItem';
import { OrderStatus, assertValidTransition } from './OrderStatus';
import { OrderPlaced } from './events/OrderPlaced';
import { OrderConfirmed } from './events/OrderConfirmed';
import { OrderCancelled } from './events/OrderCancelled';
import { Money } from './Money';

export type DomainEvent = OrderPlaced | OrderConfirmed | OrderCancelled;

export class Order {
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(
    private readonly _id: string,
    private _status: OrderStatus,
    private _customerId: string,
    private _items: OrderItem[],
    private _total: Money,
    private _paymentReference: string | null,
  ) {}

  // ── Reconstitution ──────────────────────────────────────────────────────────

  static reconstitute(events: DomainEvent[]): Order {
    if (events.length === 0) throw new Error('Cannot reconstitute Order from empty event stream');
    const first = events[0] as OrderPlaced;
    const order = new Order(
      first.orderId,
      OrderStatus.Pending,
      first.customerId,
      first.items.map(i => new OrderItem(i.orderItemId, i.sku, i.quantity, Money.ofCents(i.unitPriceCents, first.currency))),
      Money.ofCents(first.totalAmountCents, first.currency),
      null,
    );
    for (const event of events.slice(1)) order.apply(event);
    return order;
  }

  // ── Commands ─────────────────────────────────────────────────────────────────

  static place(params: {
    orderId: string;
    customerId: string;
    items: { orderItemId: string; sku: string; quantity: number; unitPriceCents: number }[];
    currency: string;
    shippingAddressId?: string;
    idempotencyKey?: string;
  }): Order {
    // INV-ORD-001: at least one item
    if (params.items.length === 0) {
      throw new InvalidOrderError('INV-ORD-001: Order must have at least one item');
    }

    // INV-ORD-002: positive quantities
    for (const item of params.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new InvalidOrderError(`INV-ORD-002: Item ${item.sku} has invalid quantity ${item.quantity}`);
      }
    }

    // INV-ORD-006: total must equal sum of line items
    const computedTotal = params.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
    const event: OrderPlaced = {
      eventId: params.orderId, // simplified; real impl generates UUID v7
      eventType: 'OrderPlaced',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      orderId: params.orderId,
      customerId: params.customerId,
      items: params.items,
      totalAmountCents: computedTotal,
      currency: params.currency,
      shippingAddressId: params.shippingAddressId,
      idempotencyKey: params.idempotencyKey,
    };

    const order = new Order(
      params.orderId,
      OrderStatus.Pending,
      params.customerId,
      params.items.map(i => new OrderItem(i.orderItemId, i.sku, i.quantity, Money.ofCents(i.unitPriceCents, params.currency))),
      Money.ofCents(computedTotal, params.currency),
      null,
    );
    order._uncommittedEvents.push(event);
    return order;
  }

  confirm(paymentReference: string): void {
    // INV-ORD-004: payment reference required
    if (!paymentReference) {
      throw new InvalidOrderError('INV-ORD-004: Cannot confirm order without payment reference');
    }
    // INV-ORD-003: valid transition
    assertValidTransition(this._status, OrderStatus.Confirmed);

    const event: OrderConfirmed = {
      eventId: crypto.randomUUID(),
      eventType: 'OrderConfirmed',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      orderId: this._id,
      paymentReference,
    };
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  cancel(reason: OrderCancelled['reason'], cancelledBy: OrderCancelled['cancelledBy']): void {
    // INV-ORD-003: valid transition
    assertValidTransition(this._status, OrderStatus.Cancelled);
    // INV-ORD-005: immutable after confirmation (post-30min window enforced at application layer)

    const event: OrderCancelled = {
      eventId: crypto.randomUUID(),
      eventType: 'OrderCancelled',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      orderId: this._id,
      customerId: this._customerId,
      reason,
      cancelledBy,
      compensationRequired: reason === 'payment_failed' || reason === 'stock_unavailable',
    };
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private apply(event: DomainEvent): void {
    // INV-ORD-005: no mutation after Confirmed
    if (this._status === OrderStatus.Confirmed && event.eventType !== 'OrderCancelled') {
      throw new InvalidOrderError('INV-ORD-005: Confirmed order is immutable');
    }
    switch (event.eventType) {
      case 'OrderConfirmed': this._status = OrderStatus.Confirmed; this._paymentReference = event.paymentReference; break;
      case 'OrderCancelled': this._status = OrderStatus.Cancelled; break;
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  get id() { return this._id; }
  get status() { return this._status; }
  get customerId() { return this._customerId; }
  get items() { return this._items; }
  get total() { return this._total; }
  get paymentReference() { return this._paymentReference; }
  get uncommittedEvents() { return [...this._uncommittedEvents]; }
  clearUncommittedEvents() { this._uncommittedEvents = []; }
}

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}
