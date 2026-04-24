// Typed event class — structurally matches contracts/event-schemas/OrderCancelled.json

export interface OrderCancelled {
  eventId: string;
  eventType: 'OrderCancelled';
  schemaVersion: 1;
  occurredAt: string;
  orderId: string;
  customerId: string;
  reason: 'customer_requested' | 'payment_failed' | 'stock_unavailable' | 'fraud_detected' | 'operator_cancelled';
  cancelledBy: 'customer' | 'system' | 'operator';
  compensationRequired: boolean;
  refundAmountCents?: number;
}
