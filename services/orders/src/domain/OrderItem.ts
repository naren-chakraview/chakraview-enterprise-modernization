import { Money } from './Money';

export class OrderItem {
  constructor(
    readonly id: string,
    readonly sku: string,
    readonly quantity: number,
    readonly unitPrice: Money,
  ) {
    // INV-ORD-002: positive integer quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`INV-ORD-002: OrderItem quantity must be a positive integer, got ${quantity}`);
    }
  }

  get lineTotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }
}
