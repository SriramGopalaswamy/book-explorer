import { describe, it, expect } from "vitest";
import {
  getPhoneConfig,
  getTaxConfig,
  extractPhoneDigits,
  validatePhone,
  validateTaxNumber,
  COUNTRY_PHONE_CONFIG,
  COUNTRY_TAX_CONFIG,
} from "@/lib/country-validation";

// ── getPhoneConfig ──────────────────────────────────────────────────────────

describe("getPhoneConfig", () => {
  it("returns config for India", () => {
    const config = getPhoneConfig("India");
    expect(config.code).toBe("+91");
    expect(config.digits).toBe(10);
  });

  it("returns config for United States", () => {
    const config = getPhoneConfig("United States");
    expect(config.code).toBe("+1");
    expect(config.digits).toBe(10);
  });

  it("returns config for Singapore (8 digits)", () => {
    const config = getPhoneConfig("Singapore");
    expect(config.digits).toBe(8);
  });

  it("returns config for China (11 digits)", () => {
    const config = getPhoneConfig("China");
    expect(config.digits).toBe(11);
  });

  it("returns default config for unknown country", () => {
    const config = getPhoneConfig("Narnia");
    expect(config.code).toBe("");
    expect(config.digits).toBe(10);
    expect(config.label).toBe("phone number");
  });

  it("returns default config for empty string", () => {
    const config = getPhoneConfig("");
    expect(config.digits).toBe(10);
  });

  it("covers all 49 configured countries", () => {
    expect(Object.keys(COUNTRY_PHONE_CONFIG).length).toBeGreaterThanOrEqual(49);
  });
});

// ── getTaxConfig ────────────────────────────────────────────────────────────

describe("getTaxConfig", () => {
  it("returns GSTIN config for India", () => {
    const config = getTaxConfig("India");
    expect(config).not.toBeNull();
    expect(config!.label).toBe("GSTIN");
  });

  it("returns EIN config for United States", () => {
    const config = getTaxConfig("United States");
    expect(config!.label).toBe("EIN");
  });

  it("returns null for country without tax config", () => {
    expect(getTaxConfig("Bangladesh")).toBeNull();
    expect(getTaxConfig("Nepal")).toBeNull();
  });

  it("returns null for unknown country", () => {
    expect(getTaxConfig("Wakanda")).toBeNull();
  });
});

// ── extractPhoneDigits ──────────────────────────────────────────────────────

describe("extractPhoneDigits", () => {
  it("strips spaces and dashes", () => {
    expect(extractPhoneDigits("98765 43210", "+91")).toBe("9876543210");
    expect(extractPhoneDigits("987-654-3210", "+91")).toBe("9876543210");
  });

  it("strips country code prefix", () => {
    expect(extractPhoneDigits("+919876543210", "+91")).toBe("9876543210");
  });

  it("strips parentheses", () => {
    expect(extractPhoneDigits("(123) 456-7890", "+1")).toBe("1234567890");
  });

  it("handles number without country code", () => {
    expect(extractPhoneDigits("9876543210", "+91")).toBe("9876543210");
  });

  it("strips non-digit chars after removing code", () => {
    expect(extractPhoneDigits("+91-98765-43210", "+91")).toBe("9876543210");
  });

  it("handles empty string", () => {
    expect(extractPhoneDigits("", "+91")).toBe("");
  });

  it("handles empty country code", () => {
    expect(extractPhoneDigits("9876543210", "")).toBe("9876543210");
  });

  it("handles UAE (+971) with longer code", () => {
    expect(extractPhoneDigits("+971501234567", "+971")).toBe("501234567");
  });
});

// ── validatePhone ───────────────────────────────────────────────────────────

describe("validatePhone", () => {
  it("returns null for empty/whitespace (optional field)", () => {
    expect(validatePhone("", "India")).toBeNull();
    expect(validatePhone("   ", "India")).toBeNull();
  });

  it("accepts valid Indian 10-digit number", () => {
    expect(validatePhone("9876543210", "India")).toBeNull();
  });

  it("accepts Indian number with country code", () => {
    expect(validatePhone("+919876543210", "India")).toBeNull();
  });

  it("accepts Indian number with spaces", () => {
    expect(validatePhone("98765 43210", "India")).toBeNull();
  });

  it("rejects Indian number with wrong digit count", () => {
    const result = validatePhone("12345", "India");
    expect(result).toContain("10 digits");
    expect(result).toContain("Got 5");
  });

  it("rejects Indian number with too many digits", () => {
    const result = validatePhone("98765432101", "India");
    expect(result).toContain("10 digits");
    expect(result).toContain("Got 11");
  });

  it("accepts valid US 10-digit number", () => {
    expect(validatePhone("(212) 555-1234", "United States")).toBeNull();
  });

  it("accepts valid Singapore 8-digit number", () => {
    expect(validatePhone("91234567", "Singapore")).toBeNull();
  });

  it("rejects Singapore number with wrong digits", () => {
    expect(validatePhone("912345678", "Singapore")).not.toBeNull();
  });

  it("accepts valid Norway 8-digit number", () => {
    expect(validatePhone("12345678", "Norway")).toBeNull();
  });

  it("accepts valid Australia 9-digit number", () => {
    expect(validatePhone("412345678", "Australia")).toBeNull();
  });

  it("returns error for digits-only empty after stripping", () => {
    const result = validatePhone("+++", "India");
    expect(result).toBe("Enter a valid phone number");
  });

  it("validates against unknown country with 10-digit default", () => {
    expect(validatePhone("1234567890", "Atlantis")).toBeNull();
    expect(validatePhone("12345", "Atlantis")).not.toBeNull();
  });
});

// ── validateTaxNumber ───────────────────────────────────────────────────────

describe("validateTaxNumber", () => {
  it("returns null for empty/whitespace (optional field)", () => {
    expect(validateTaxNumber("", "India")).toBeNull();
    expect(validateTaxNumber("   ", "India")).toBeNull();
  });

  it("returns null for country without tax config", () => {
    expect(validateTaxNumber("ANYTHING", "Bangladesh")).toBeNull();
  });

  // ── India GSTIN ──
  describe("India GSTIN", () => {
    it("accepts valid GSTIN", () => {
      expect(validateTaxNumber("22AAAAA0000A1Z5", "India")).toBeNull();
    });

    it("rejects invalid GSTIN", () => {
      expect(validateTaxNumber("INVALID", "India")).not.toBeNull();
    });

    it("rejects GSTIN with lowercase", () => {
      expect(validateTaxNumber("22aaaaa0000a1z5", "India")).not.toBeNull();
    });

    it("error mentions GSTIN and expected format", () => {
      const result = validateTaxNumber("BAD", "India");
      expect(result).toContain("GSTIN");
      expect(result).toContain("22AAAAA0000A1Z5");
    });
  });

  // ── US EIN ──
  describe("United States EIN", () => {
    it("accepts valid EIN", () => {
      expect(validateTaxNumber("12-3456789", "United States")).toBeNull();
    });

    it("rejects EIN without dash", () => {
      expect(validateTaxNumber("123456789", "United States")).not.toBeNull();
    });

    it("rejects EIN with wrong format", () => {
      expect(validateTaxNumber("1-23456789", "United States")).not.toBeNull();
    });
  });

  // ── UK VAT ──
  describe("United Kingdom VAT", () => {
    it("accepts 9-digit VAT", () => {
      expect(validateTaxNumber("GB123456789", "United Kingdom")).toBeNull();
    });

    it("accepts 12-digit VAT", () => {
      expect(validateTaxNumber("GB123456789012", "United Kingdom")).toBeNull();
    });

    it("accepts GBGD format", () => {
      expect(validateTaxNumber("GBGD123", "United Kingdom")).toBeNull();
    });

    it("accepts GBHA format", () => {
      expect(validateTaxNumber("GBHA456", "United Kingdom")).toBeNull();
    });

    it("rejects without GB prefix", () => {
      expect(validateTaxNumber("123456789", "United Kingdom")).not.toBeNull();
    });
  });

  // ── Germany USt-IdNr ──
  describe("Germany USt-IdNr", () => {
    it("accepts valid USt-IdNr", () => {
      expect(validateTaxNumber("DE123456789", "Germany")).toBeNull();
    });

    it("rejects without DE prefix", () => {
      expect(validateTaxNumber("123456789", "Germany")).not.toBeNull();
    });
  });

  // ── Singapore GST ──
  describe("Singapore GST", () => {
    it("accepts M-prefixed format", () => {
      expect(validateTaxNumber("M1234567X", "Singapore")).toBeNull();
    });

    it("accepts numeric format with letter suffix", () => {
      expect(validateTaxNumber("123456789X", "Singapore")).toBeNull();
    });
  });

  // ── UAE TRN ──
  describe("UAE TRN", () => {
    it("accepts valid 15-digit TRN", () => {
      expect(validateTaxNumber("100000000000003", "United Arab Emirates")).toBeNull();
    });

    it("rejects short TRN", () => {
      expect(validateTaxNumber("12345678", "United Arab Emirates")).not.toBeNull();
    });
  });

  // ── Saudi Arabia VAT ──
  describe("Saudi Arabia VAT", () => {
    it("accepts valid number starting with 3", () => {
      expect(validateTaxNumber("300000000000003", "Saudi Arabia")).toBeNull();
    });

    it("rejects number not starting with 3", () => {
      expect(validateTaxNumber("100000000000003", "Saudi Arabia")).not.toBeNull();
    });
  });

  // ── Japan Invoice Registration ──
  describe("Japan Invoice Reg", () => {
    it("accepts valid T-prefixed 13-digit number", () => {
      expect(validateTaxNumber("T1234567890123", "Japan")).toBeNull();
    });

    it("rejects without T prefix", () => {
      expect(validateTaxNumber("1234567890123", "Japan")).not.toBeNull();
    });
  });

  // ── Brazil CNPJ ──
  describe("Brazil CNPJ", () => {
    it("accepts 14-digit format", () => {
      expect(validateTaxNumber("12345678000195", "Brazil")).toBeNull();
    });

    it("accepts formatted CNPJ", () => {
      expect(validateTaxNumber("12.345.678/0001-95", "Brazil")).toBeNull();
    });

    it("rejects partial CNPJ", () => {
      expect(validateTaxNumber("1234567800", "Brazil")).not.toBeNull();
    });
  });

  // ── Switzerland UID ──
  describe("Switzerland UID", () => {
    it("accepts valid UID format", () => {
      expect(validateTaxNumber("CHE-123.456.789", "Switzerland")).toBeNull();
    });

    it("rejects without CHE prefix", () => {
      expect(validateTaxNumber("123.456.789", "Switzerland")).not.toBeNull();
    });
  });

  // ── South Korea BRN ──
  describe("South Korea BRN", () => {
    it("accepts valid BRN", () => {
      expect(validateTaxNumber("123-45-67890", "South Korea")).toBeNull();
    });

    it("rejects without dashes", () => {
      expect(validateTaxNumber("1234567890", "South Korea")).not.toBeNull();
    });
  });

  // ── Trimming behavior ──
  it("trims whitespace before validation", () => {
    expect(validateTaxNumber("  12-3456789  ", "United States")).toBeNull();
  });

  // ── Turkey VKN ──
  it("accepts valid Turkish VKN (10 digits)", () => {
    expect(validateTaxNumber("1234567890", "Turkey")).toBeNull();
  });

  // ── Canada GST/HST ──
  it("accepts valid Canadian GST/HST", () => {
    expect(validateTaxNumber("123456789RT0001", "Canada")).toBeNull();
  });
});
