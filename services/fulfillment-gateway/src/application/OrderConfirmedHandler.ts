import { OrderConfirmed } from '../domain/events/OrderConfirmed';
import { WarehouseClient, DispatchResult } from '../infrastructure/WarehouseClient';
import { otel } from '../infrastructure/OtelInstrumentation';

export interface MessageEnvelope {
  topic: string;
  partition: number;
  offset: string;
  value: OrderConfirmed;
}

export class OrderConfirmedHandler {
  constructor(private readonly warehouse: WarehouseClient) {}

  async handle(message: MessageEnvelope): Promise<void> {
    const event = message.value;
    const startMs = Date.now();

    otel.dispatchAttempts.add(1, { service: 'fulfillment-gateway' });

    let result: DispatchResult;
    try {
      result = await this.warehouse.dispatchFulfillment({
        orderId: event.orderId,
        customerId: event.customerId,
        shippingAddress: event.shippingAddress,
        lineItems: event.items.map(item => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
        confirmedAt: event.occurredAt,
      });
    } catch (err) {
      otel.dispatchErrors.add(1, { service: 'fulfillment-gateway', reason: 'warehouse_error' });
      // Re-throw: Kafka consumer will retry up to the configured retry budget.
      // On exhaustion, the consumer framework writes the message to the dead-letter topic.
      throw err;
    } finally {
      otel.warehouseCallDuration.record((Date.now() - startMs) / 1000, {
        service: 'fulfillment-gateway',
      });
    }

    if (!result.accepted) {
      // WMS rejected the dispatch for a business reason (duplicate, unknown SKU, etc.).
      // Do not retry — log and send to dead-letter.
      otel.dispatchErrors.add(1, {
        service: 'fulfillment-gateway',
        reason: 'wms_rejected',
        wms_code: result.rejectionCode ?? 'unknown',
      });
      throw new DispatchRejectedError(event.orderId, result.rejectionCode, result.rejectionMessage);
    }

    otel.dispatchSuccesses.add(1, { service: 'fulfillment-gateway' });
  }
}

export class DispatchRejectedError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly wmsCode: string | undefined,
    public readonly wmsMessage: string | undefined,
  ) {
    super(`WMS rejected fulfillment for order ${orderId}: [${wmsCode}] ${wmsMessage}`);
    this.name = 'DispatchRejectedError';
  }
}
