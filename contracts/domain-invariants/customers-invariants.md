# Customers Domain — Business Invariants

---

## INV-CUS-001: Email addresses must be unique across all Customers

No two Customer aggregates may have the same email address. The `RegisterCustomer` command must check for email uniqueness before creating the aggregate. This is enforced at the database layer (unique index) and at the application layer (idempotency key check).

*Failure consequence*: Two accounts for the same person; authentication confusion; GDPR deletion complexity.

---

## INV-CUS-002: A suspended Customer cannot place new Orders

The Customers service publishes `CustomerSuspended` events when a customer is suspended. The Orders service consumes this event and rejects `PlaceOrder` commands from suspended customers. The check is not synchronous between services — the Orders service maintains a local projection of suspended customer IDs.

---

## INV-CUS-003: Customer data deletion must be cascaded

When a customer exercises their right to erasure (GDPR Article 17), the deletion must propagate to:
- The Customers PostgreSQL record (hard delete or pseudonymization)
- Any `CustomerRegistered` or `AddressUpdated` events in the event store (pseudonymization, not deletion, as event streams are append-only)
- The Orders service read model (customer name and address fields on Orders)

The cascading deletion must complete within 30 days (see `customers-sla.yaml`).

---

## INV-CUS-004: A Customer's primary email address cannot be changed to an address already in use

An `UpdateEmail` command must reject the new address if it is already associated with another Customer. This is the same uniqueness constraint as registration, applied to updates.

---

## INV-CUS-005: Customer registration is idempotent

If a `RegisterCustomer` command is retried with the same `idempotencyKey`, it must return the same result as the original command without creating a duplicate Customer. The idempotency key is stored for 24 hours.
