/**
 * Currency conversion utilities (KAN-767).
 *
 * Canonical formula:
 *   amount_in_org_currency = foreign_currency_amount * exchange_rate
 *
 * Example: 1 AUD at exchange_rate=85 → ₹85 INR (NOT ₹0.01).
 *
 * NEVER divide by the exchange rate when converting from foreign currency
 * into the organisation base currency. Division is the historical bug.
 */

export interface ConvertToBaseInput {
  amount: number;
  currency: string;
  exchangeRate: number | null | undefined;
  baseCurrency?: string;
}

/**
 * Convert a foreign-currency amount to the organisation's base currency.
 *
 * - When the source currency equals the base currency, returns the amount
 *   unchanged (effective rate = 1.0), regardless of `exchangeRate`.
 * - When the rate is missing or non-positive for a foreign currency, returns 0
 *   to avoid producing nonsensical values silently.
 */
export function convertToBase({
  amount,
  currency,
  exchangeRate,
  baseCurrency = "INR",
}: ConvertToBaseInput): number {
  const amt = Number(amount);
  if (!Number.isFinite(amt)) return 0;

  const src = (currency || baseCurrency).toUpperCase();
  const base = baseCurrency.toUpperCase();

  // Same-currency guard
  if (src === base) return amt;

  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  return amt * rate;
}
