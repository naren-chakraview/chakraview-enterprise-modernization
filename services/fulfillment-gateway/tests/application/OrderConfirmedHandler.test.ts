import { OrderConfirmedHandler, DispatchRejectedError } from '../../src/application/OrderConfirmedHandler';
import { WarehouseClient, DispatchResult } from '../../src/infrastructure/WarehouseClient';
import { OrderConfirmed } from '../../src/domain/events/OrderConfirmed';

const makeEvent = (overrides: Partial<OrderConfirmed> = {}): OrderConfirmed => ({
  eventId: 'evt-001',
  eventType: 'OrderConfirmed',
  schemaVersion: '1.0',
  occurredAt: '2024-03-15T10:00:00Z',
  orderId: 'ord-abc-123',
  customerId: 'cust-xyz-456',
  items: [{ sku: 'SKU-001', quantity: 2, unitPriceCents: 1000 }],
  totalAmountCents: 2000,
  currency: 'USD',
  shippingAddress: {
    line1: '123 Main St',
    city: 'Springfield',
    postCode: '12345',
    countryCode: 'US',
  },
  ...overrides,
});

const makeEnvelope = (event: OrderConfirmed) => ({
  topic: 'chakra.orders.confirmed',
  partition: 0,
  offset: '42',
  value: event,
});

describe('OrderConfirmedHandler', () => {
  let warehouseMock: jest.Mocked<WarehouseClient>;
  let handler: OrderConfirmedHandler;

  beforeEach(() => {
    warehouseMock = {
      dispatchFulfillment: jest.fn(),
    } as unknown as jest.Mocked<WarehouseClient>;
    handler = new OrderConfirmedHandler(warehouseMock);
  });

  it('dispatches fulfillment to WMS on OrderConfirmed', async () => {
    const result: DispatchResult = { accepted: true, wmsReference: 'WMS-REF-001' };
    warehouseMock.dispatchFulfillment.mockResolvedValue(result);

    await handler.handle(makeEnvelope(makeEvent()));

    expect(warehouseMock.dispatchFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord-abc-123' }),
    );
  });

  it('throws DispatchRejectedError when WMS rejects the dispatch', async () => {
    const result: DispatchResult = {
      accepted: false,
      rejectionCode: 'UNKNOWN_SKU',
      rejectionMessage: 'Product code SKU-001 not found in WMS catalogue',
    };
    warehouseMock.dispatchFulfillment.mockResolvedValue(result);

    await expect(handler.handle(makeEnvelope(makeEvent()))).rejects.toBeInstanceOf(
      DispatchRejectedError,
    );
  });

  it('re-throws warehouse errors so the Kafka consumer retries', async () => {
    warehouseMock.dispatchFulfillment.mockRejectedValue(new Error('WMS connection timeout'));

    await expect(handler.handle(makeEnvelope(makeEvent()))).rejects.toThrow(
      'WMS connection timeout',
    );
  });
});
