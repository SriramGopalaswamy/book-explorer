import { describe, it, expect } from "vitest";
import { convertToBase } from "@/lib/currency";

describe("convertToBase (KAN-767)", () => {
  it("returns the amount unchanged when source currency matches base", () => {
    expect(convertToBase({ amount: 1000, currency: "INR", exchangeRate: 99 })).toBe(1000);
  });

  it("multiplies (not divides) AUD by exchange rate to produce INR", () => {
    // 1 AUD at rate 85 must be ₹85, not ₹0.01.
    expect(convertToBase({ amount: 1, currency: "AUD", exchangeRate: 85 })).toBe(85);
    expect(convertToBase({ amount: 100, currency: "USD", exchangeRate: 83.5 })).toBe(8350);
  });

  it("returns 0 for a non-positive or zero exchange rate on foreign currency", () => {
    expect(convertToBase({ amount: 100, currency: "USD", exchangeRate: 0 })).toBe(0);
    expect(convertToBase({ amount: 100, currency: "USD", exchangeRate: -1 })).toBe(0);
    expect(convertToBase({ amount: 100, currency: "USD", exchangeRate: null })).toBe(0);
  });

  it("respects an explicit base currency override", () => {
    expect(convertToBase({ amount: 50, currency: "USD", exchangeRate: 1, baseCurrency: "USD" })).toBe(50);
  });
});
