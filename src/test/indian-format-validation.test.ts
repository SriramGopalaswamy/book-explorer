import { describe, it, expect } from "vitest";
import {
  isValidPAN, isValidGSTIN, isValidPincode,
  validatePAN, validateGSTIN, validatePincode,
  PAN_REGEX, GSTIN_REGEX, PINCODE_REGEX,
} from "@/lib/country-validation";

describe("Indian format validators (PAN / GSTIN / Pincode)", () => {
  describe("PAN", () => {
    it("accepts valid PAN", () => {
      expect(isValidPAN("ABCDE1234F")).toBe(true);
      expect(validatePAN("ABCDE1234F")).toBeNull();
    });
    it("rejects malformed PAN", () => {
      expect(isValidPAN("ABCD1234F")).toBe(false);
      expect(isValidPAN("ABCDE12345")).toBe(false);
      expect(isValidPAN("abcde1234f")).toBe(false);
      expect(validatePAN("XYZ")).toMatch(/Invalid PAN/);
    });
    it("treats empty as optional", () => {
      expect(validatePAN("")).toBeNull();
      expect(validatePAN("   ")).toBeNull();
    });
  });

  describe("GSTIN", () => {
    it("accepts valid GSTIN", () => {
      expect(isValidGSTIN("29ABCDE1234F1Z5")).toBe(true);
      expect(validateGSTIN("29ABCDE1234F1Z5")).toBeNull();
    });
    it("rejects bad length / shape", () => {
      expect(isValidGSTIN("29ABCDE1234F1Z")).toBe(false);
      expect(isValidGSTIN("XXABCDE1234F1Z5")).toBe(false);
      expect(validateGSTIN("foo")).toMatch(/Invalid GSTIN/);
    });
  });

  describe("Pincode", () => {
    it("accepts valid 6-digit pincode", () => {
      expect(isValidPincode("560001")).toBe(true);
      expect(validatePincode("400072")).toBeNull();
    });
    it("rejects pincode starting with 0 or wrong length", () => {
      expect(isValidPincode("056000")).toBe(false);
      expect(isValidPincode("12345")).toBe(false);
      expect(isValidPincode("1234567")).toBe(false);
      expect(validatePincode("00000")).toMatch(/Invalid pincode/);
    });
  });

  it("regexes are exported and reusable", () => {
    expect(PAN_REGEX.test("ABCDE1234F")).toBe(true);
    expect(GSTIN_REGEX.test("29ABCDE1234F1Z5")).toBe(true);
    expect(PINCODE_REGEX.test("560001")).toBe(true);
  });
});
