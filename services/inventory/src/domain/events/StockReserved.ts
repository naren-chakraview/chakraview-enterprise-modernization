// Typed event class — structurally matches contracts/event-schemas/StockReserved.json

export interface StockReserved {
  eventId: string;
  eventType: 'StockReserved';
  schemaVersion: 1;
  occurredAt: string;
  reservationId: string;
  orderId: string;
  sku: string;
  quantityReserved: number;    // INV-INV-001: must be <= available stock at time of reservation
  availableAfterReservation: number;
  expiresAt: string;
}
