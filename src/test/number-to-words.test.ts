import { describe, it, expect } from "vitest";
import { numberToWords } from "@/lib/number-to-words";

describe("numberToWords – Indian currency conversion", () => {
  // ── Zero & small numbers ──
  it("returns 'Zero' for 0", () => {
    expect(numberToWords(0)).toBe("Rupees Zero Only");
  });

  it("converts 1", () => {
    expect(numberToWords(1)).toBe("Rupees One Only");
  });

  it("converts teens (11-19)", () => {
    expect(numberToWords(11)).toBe("Rupees Eleven Only");
    expect(numberToWords(19)).toBe("Rupees Nineteen Only");
  });

  it("converts tens (20, 30, 90)", () => {
    expect(numberToWords(20)).toBe("Rupees Twenty Only");
    expect(numberToWords(90)).toBe("Rupees Ninety Only");
  });

  it("converts two-digit combinations", () => {
    expect(numberToWords(42)).toBe("Rupees Forty Two Only");
    expect(numberToWords(99)).toBe("Rupees Ninety Nine Only");
  });

  // ── Hundreds ──
  it("converts exact hundreds", () => {
    expect(numberToWords(100)).toBe("Rupees One Hundred Only");
    expect(numberToWords(500)).toBe("Rupees Five Hundred Only");
  });

  it("converts hundreds with remainder", () => {
    expect(numberToWords(101)).toBe("Rupees One Hundred and One Only");
    expect(numberToWords(250)).toBe("Rupees Two Hundred and Fifty Only");
    expect(numberToWords(999)).toBe("Rupees Nine Hundred and Ninety Nine Only");
  });

  // ── Thousands (Indian grouping) ──
  it("converts exact thousands", () => {
    expect(numberToWords(1000)).toBe("Rupees One Thousand Only");
    expect(numberToWords(50000)).toBe("Rupees Fifty Thousand Only");
  });

  it("converts thousands with remainder", () => {
    expect(numberToWords(1234)).toBe("Rupees One Thousand Two Hundred and Thirty Four Only");
    expect(numberToWords(99999)).toBe("Rupees Ninety Nine Thousand Nine Hundred and Ninety Nine Only");
  });

  // ── Lakhs ──
  it("converts exact lakhs", () => {
    expect(numberToWords(100000)).toBe("Rupees One Lakh Only");
    expect(numberToWords(5000000)).toBe("Rupees Fifty Lakh Only");
  });

  it("converts lakhs with remainder", () => {
    expect(numberToWords(150000)).toBe("Rupees One Lakh Fifty Thousand Only");
    expect(numberToWords(1234567)).toBe("Rupees Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven Only");
  });

  // ── Crores ──
  it("converts exact crores", () => {
    expect(numberToWords(10000000)).toBe("Rupees One Crore Only");
    expect(numberToWords(500000000)).toBe("Rupees Fifty Crore Only");
  });

  it("converts crores with full breakdown", () => {
    expect(numberToWords(12345678)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred and Seventy Eight Only"
    );
  });

  // ── Typical payroll amounts ──
  it("handles typical salary: ₹25,000", () => {
    expect(numberToWords(25000)).toBe("Rupees Twenty Five Thousand Only");
  });

  it("handles typical salary: ₹1,50,000", () => {
    expect(numberToWords(150000)).toBe("Rupees One Lakh Fifty Thousand Only");
  });

  it("handles typical CTC: ₹18,00,000", () => {
    expect(numberToWords(1800000)).toBe("Rupees Eighteen Lakh Only");
  });

  // ── Edge cases ──
  it("rounds fractional amounts (paise)", () => {
    expect(numberToWords(25000.75)).toBe("Rupees Twenty Five Thousand and One Only");
  });

  it("rounds .49 down", () => {
    expect(numberToWords(100.49)).toBe("Rupees One Hundred Only");
  });

  it("handles negative numbers (uses absolute value)", () => {
    expect(numberToWords(-5000)).toBe("Rupees Five Thousand Only");
  });

  it("handles very large number: ₹99,99,99,999", () => {
    expect(numberToWords(999999999)).toBe(
      "Rupees Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine Only"
    );
  });
});
