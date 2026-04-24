import { otel } from './OtelInstrumentation';

// ─── Domain types (internal vocabulary) ──────────────────────────────────────

export interface FulfillmentRequest {
  orderId: string;
  customerId: string;
  shippingAddress: ShippingAddress;
  lineItems: LineItem[];
  confirmedAt: string; // ISO-8601
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  postCode: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

export interface LineItem {
  sku: string;
  quantity: number;
}

export interface DispatchResult {
  accepted: boolean;
  wmsReference?: string;    // WMS-assigned tracking ID on success
  rejectionCode?: string;   // WMS error code on rejection
  rejectionMessage?: string;
}

// ─── Legacy WMS types (vendor SOAP vocabulary) ───────────────────────────────
// These types match the WMS vendor SOAP schema exactly. They are not exported.
// Nothing outside this file should know they exist — this is the Leave-and-Layer boundary.

interface WmsDispatchRequest {
  OrderID: string;           // WMS uses PascalCase field names from 2004 SOAP spec
  CustomerRef: string;
  DeliveryAddress: {
    AddressLine1: string;
    AddressLine2: string;
    TownCity: string;
    PostCode: string;
    CountryCode: string;
  };
  OrderLines: Array<{
    ProductCode: string;   // WMS calls SKUs "ProductCode"
    Qty: number;           // WMS uses "Qty" not "quantity"
  }>;
  OrderDate: string;         // WMS expects DD/MM/YYYY
  Priority: number;          // WMS priority field: 1=standard, 2=express (hardcoded to 1)
}

interface WmsDispatchResponse {
  Status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE';
  WMSRef?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class WarehouseClient {
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private consecutiveFailures = 0;
  private lastOpenedAt = 0;

  // Thresholds come from contracts/slas/fulfillment-sla.yaml
  private readonly FAILURE_THRESHOLD = 5;
  private readonly OPEN_DURATION_MS = 30_000;

  constructor(
    private readonly wmsBaseUrl: string,
    private readonly timeoutMs = 2000,
  ) {}

  async dispatchFulfillment(request: FulfillmentRequest): Promise<DispatchResult> {
    this.enforceCircuitBreaker();

    const wmsPayload = this.toWmsRequest(request);
    let wmsResponse: WmsDispatchResponse;

    try {
      wmsResponse = await this.callWmsSoap(wmsPayload);
      this.onSuccess();
    } catch (err) {
      this.onFailure();
      throw err;
    }

    return this.fromWmsResponse(wmsResponse);
  }

  // ── Translation layer (the "layer" in Leave-and-Layer) ─────────────────────

  private toWmsRequest(req: FulfillmentRequest): WmsDispatchRequest {
    return {
      OrderID: req.orderId,
      CustomerRef: req.customerId,
      DeliveryAddress: {
        AddressLine1: req.shippingAddress.line1,
        AddressLine2: req.shippingAddress.line2 ?? '',
        TownCity: req.shippingAddress.city,
        PostCode: req.shippingAddress.postCode,
        CountryCode: req.shippingAddress.countryCode,
      },
      OrderLines: req.lineItems.map(item => ({
        ProductCode: item.sku,
        Qty: item.quantity,
      })),
      OrderDate: this.toWmsDateFormat(req.confirmedAt),
      Priority: 1,
    };
  }

  private fromWmsResponse(res: WmsDispatchResponse): DispatchResult {
    if (res.Status === 'DUPLICATE') {
      // WMS already has this order — idempotent success
      return { accepted: true, wmsReference: res.WMSRef };
    }
    if (res.Status === 'ACCEPTED') {
      return { accepted: true, wmsReference: res.WMSRef };
    }
    return {
      accepted: false,
      rejectionCode: res.ErrorCode,
      rejectionMessage: res.ErrorMessage,
    };
  }

  private toWmsDateFormat(iso: string): string {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  // ── Circuit breaker ────────────────────────────────────────────────────────

  private enforceCircuitBreaker(): void {
    if (this.circuitState === 'open') {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= this.OPEN_DURATION_MS) {
        this.circuitState = 'half-open';
        otel.circuitBreakerState.record(2, { service: 'fulfillment-gateway' }); // 2 = half-open
      } else {
        throw new CircuitOpenError('WMS circuit breaker is open; call rejected');
      }
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.circuitState !== 'closed') {
      this.circuitState = 'closed';
      otel.circuitBreakerState.record(0, { service: 'fulfillment-gateway' }); // 0 = closed
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.circuitState = 'open';
      this.lastOpenedAt = Date.now();
      otel.circuitBreakerState.record(1, { service: 'fulfillment-gateway' }); // 1 = open
    }
  }

  // ── WMS SOAP transport (stub — real impl uses node-soap or raw HTTP POST) ──

  private async callWmsSoap(payload: WmsDispatchRequest): Promise<WmsDispatchResponse> {
    // TODO (agent task): implement using the WMS WSDL at contracts/wms/wms-dispatch.wsdl
    // Use a 2000ms timeout (contracts/slas/fulfillment-sla.yaml dispatch_latency.p99_ms)
    throw new Error('WMS SOAP transport not yet implemented');
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
