// Read-only view of the OrderConfirmed event published by the Orders service.
// This type is consumed by the Fulfillment Gateway; it must not diverge from
// contracts/event-schemas/OrderConfirmed.json.

export interface OrderConfirmed {
  readonly eventId: string;
  readonly eventType: 'OrderConfirmed';
  readonly schemaVersion: '1.0';
  readonly occurredAt: string; // ISO-8601
  readonly orderId: string;
  readonly customerId: string;
  readonly items: ReadonlyArray<{
    readonly sku: string;
    readonly quantity: number;
    readonly unitPriceCents: number;
  }>;
  readonly totalAmountCents: number;
  readonly currency: string; // ISO 4217
  readonly shippingAddress: {
    readonly line1: string;
    readonly line2?: string;
    readonly city: string;
    readonly postCode: string;
    readonly countryCode: string; // ISO 3166-1 alpha-2
  };
}
