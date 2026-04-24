# Inventory Domain — Business Invariants

---

## INV-INV-001: Stock level must never go below zero (no oversell)

The available stock for any SKU must never be reduced below zero by a reservation. A `ReserveStock` command must be rejected if `available_quantity < requested_quantity`. This check must be atomic — no TOCTOU race condition is acceptable.

*Failure consequence*: Orders confirmed for items that cannot be fulfilled. This is a P0 integrity failure.
*Enforcement*: PostgreSQL row-level locking on the reservation transaction.

---

## INV-INV-002: A reservation must reference a valid Order

Every stock reservation carries an `orderId`. The Inventory service validates that the `orderId` is syntactically valid (UUID v7 format). It does not validate that the Order exists in the Orders service — that coupling would create a synchronous dependency. Orphaned reservations are cleaned up by the reservation expiry job.

---

## INV-INV-003: A reservation expires after the reservation TTL

If an order is not confirmed within the reservation TTL (default: 15 minutes), the reservation is expired and the stock is released. The expiry is managed by a scheduled job, not by the Orders service. An expired reservation does not constitute an Inventory error; it is expected behavior.

---

## INV-INV-004: Releasing more stock than was reserved is forbidden

A `ReleaseStockReservation` command cannot release a quantity greater than the original reservation quantity. The release amount is clamped to the reservation amount. Over-release would create phantom stock.

---

## INV-INV-005: SKU stock levels are independent

A reservation on SKU-A has no effect on SKU-B. Reservations are scoped to individual SKUs. An order with multiple SKUs creates multiple independent reservations, each subject to the no-oversell invariant independently.

---

## INV-INV-006: The Redis read projection is eventually consistent, not authoritative

All decisions that affect stock correctness (reservations, releases) are made against the PostgreSQL write model. The Redis projection is for read queries only. Any code path that makes a reservation decision based on the Redis cache violates this invariant.

*Failure consequence*: Oversell due to stale read projection being used for write decisions.
