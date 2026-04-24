// Typed event class for OrderConfirmed

export interface OrderConfirmed {
  eventId: string;
  eventType: 'OrderConfirmed';
  schemaVersion: 1;
  occurredAt: string;
  orderId: string;
  paymentReference: string;  // INV-ORD-004: required on confirmation
}
