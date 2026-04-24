// Typed event class — structurally matches contracts/event-schemas/CustomerRegistered.json

export interface CustomerRegistered {
  eventId: string;
  eventType: 'CustomerRegistered';
  schemaVersion: 1;
  occurredAt: string;
  customerId: string;
  email: string;              // INV-CUS-001: unique across all customers
  registeredAt: string;
  marketingConsent: boolean;
  acquisitionChannel?: 'organic' | 'referral' | 'paid_search' | 'social' | 'email' | 'unknown';
}
