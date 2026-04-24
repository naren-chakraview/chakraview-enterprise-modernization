// Value object. Amounts are stored in the smallest currency unit (cents) to avoid floating-point errors.

export class Money {
  private constructor(
    readonly amountCents: number,
    readonly currency: string,
  ) {}

  static ofCents(cents: number, currency: string): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new Error(`Money amount must be a non-negative integer (cents), got ${cents}`);
    }
    return new Money(cents, currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amountCents * factor), this.currency);
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('Cannot add Money of different currencies');
    return new Money(this.amountCents + other.amountCents, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountCents === other.amountCents && this.currency === other.currency;
  }
}
