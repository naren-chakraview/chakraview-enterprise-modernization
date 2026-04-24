# Orders Domain — Business Invariants

These rules must never be violated. An implementation that breaks any of these invariants is incorrect, regardless of test coverage. AI agents implementing the Orders domain must treat these as hard constraints, not guidelines.

Each invariant has an ID that is referenced in domain model code and tests.

---

## INV-ORD-001: An Order must have at least one item

An Order cannot be placed with zero line items. The `PlaceOrder` command must be rejected if the items list is empty or missing.

*Failure consequence*: Revenue loss from phantom orders that trigger stock reservation and payment.

---

## INV-ORD-002: Order item quantities must be positive integers

Each line item quantity must be a whole number greater than zero. Fractional quantities and zero-quantity items are invalid.

*Failure consequence*: Inventory reservation math breaks; negative stock levels possible.

---

## INV-ORD-003: An Order may only transition through valid status sequences

Valid transitions:
- `Pending` → `AwaitingPayment`
- `AwaitingPayment` → `Confirmed`
- `AwaitingPayment` → `Cancelled`
- `Pending` → `Cancelled`
- `Confirmed` → `Cancelled` (only within 30 minutes of confirmation; after that, cancellation requires a refund flow)

Any other transition (e.g., `Confirmed` → `Pending`, `Cancelled` → `Confirmed`) must be rejected with a domain error.

*Failure consequence*: Double-payments, phantom stock holds, incorrect fulfillment triggers.

---

## INV-ORD-004: A confirmed Order must have a non-null payment reference

When an Order transitions to `Confirmed`, it must carry a `paymentReference` from the Payment Gateway. An `OrderConfirmed` event without a `paymentReference` is malformed and must not be appended to the event store.

*Failure consequence*: Unable to reconcile payments; fulfillment without proof of payment.

---

## INV-ORD-005: An Order cannot be modified after confirmation

Once an `OrderConfirmed` event has been appended, no further item changes are allowed. Price, quantity, and SKU are immutable. Corrections require a cancellation and re-order.

*Failure consequence*: Audit trail inconsistency; inventory reservation mismatch.

---

## INV-ORD-006: The Order total must equal the sum of line item totals

At the time of placement, the `Order.total` must exactly equal `sum(item.quantity * item.unitPrice)`. This is validated in the `Order` aggregate before the `OrderPlaced` event is appended.

*Failure consequence*: Financial discrepancy between charged amount and order value.

---

## INV-ORD-007: Each Order must belong to a valid, non-suspended Customer

The `PlaceOrder` command must validate that the `customerId` exists and is not suspended at the time of placement. An Order for a suspended customer must be rejected.

*Failure consequence*: Revenue from fraudulent or suspended accounts.

---

## INV-ORD-008: Stock reservation must precede payment capture

The saga sequence is fixed: reserve stock, then capture payment. Capturing payment before confirming stock availability violates this invariant. If stock reservation fails, the saga must not proceed to payment.

*Failure consequence*: Customer charged for items that cannot be fulfilled.

---

## INV-ORD-009: A cancelled Order must release its stock reservation

When an `OrderCancelled` event is appended, the saga orchestrator must publish a `ReleaseStockReservation` command to Inventory. The release must happen whether cancellation was customer-initiated or saga-compensated.

*Failure consequence*: Inventory over-reserved; real stock unavailable for new orders.

---

## INV-ORD-010: Order IDs must be globally unique

Order IDs are generated using UUID v7 (time-ordered). Two Orders must never share an ID. The event store enforces this via stream-level optimistic concurrency; the application layer must not assume it.

*Failure consequence*: Event stream corruption; incorrect aggregate reconstruction.
