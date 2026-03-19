import { describe, it, expect } from "vitest";
import {
  createPayrollSchema,
  createInvoiceSchema,
} from "@/lib/validation-schemas";

// ======================== PAYROLL SCHEMA TESTS ========================

describe("createPayrollSchema edge cases", () => {
  const validPayroll = {
    profile_id: "550e8400-e29b-41d4-a716-446655440000",
    pay_period: "March 2026",
    basic_salary: 50000,
    hra: 20000,
    transport_allowance: 3000,
    other_allowances: 5000,
    pf_deduction: 6000,
    tax_deduction: 4000,
    other_deductions: 1000,
    net_pay: 67000,
  };

  // ---------- basic_salary ----------

  it("accepts zero basic_salary (nonnegative allows zero)", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative basic_salary", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join("."));
      expect(issues).toContain("basic_salary");
    }
  });

  it("rejects fractionally negative basic_salary", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: -0.01,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative hra", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      hra: -500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative transport_allowance", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      transport_allowance: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative other_allowances", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      other_allowances: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative other_deductions", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      other_deductions: -1,
    });
    expect(result.success).toBe(false);
  });

  // ---------- working_days ----------

  it("accepts working_days of 365 (max boundary)", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      working_days: 365,
    });
    expect(result.success).toBe(true);
  });

  it("rejects working_days greater than 365", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      working_days: 366,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join("."));
      expect(issues).toContain("working_days");
    }
  });

  it("rejects working_days of 400", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      working_days: 400,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative working_days", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      working_days: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts working_days of zero", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      working_days: 0,
    });
    expect(result.success).toBe(true);
  });

  // ---------- lop_days ----------

  it("accepts lop_days at max boundary (365)", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      lop_days: 365,
    });
    expect(result.success).toBe(true);
  });

  it("rejects lop_days exceeding 365", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      lop_days: 400,
    });
    expect(result.success).toBe(false);
  });

  it("accepts lop_days of zero", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      lop_days: 0,
    });
    expect(result.success).toBe(true);
  });

  // ---------- paid_days ----------

  it("rejects paid_days exceeding 365", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      paid_days: 366,
    });
    expect(result.success).toBe(false);
  });

  it("accepts paid_days at exactly 365", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      paid_days: 365,
    });
    expect(result.success).toBe(true);
  });

  // ---------- large amounts near max ----------

  it("accepts amounts at exactly the max (9999999999)", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: 9999999999,
      hra: 9999999999,
      net_pay: 9999999999,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all monetary fields at max simultaneously", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: 9999999999,
      hra: 9999999999,
      transport_allowance: 9999999999,
      other_allowances: 9999999999,
      pf_deduction: 9999999999,
      tax_deduction: 9999999999,
      other_deductions: 9999999999,
      lop_deduction: 9999999999,
      net_pay: 9999999999,
    });
    expect(result.success).toBe(true);
  });

  it("rejects basic_salary exceeding the max (10000000000)", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      basic_salary: 10000000000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join("."));
      expect(issues).toContain("basic_salary");
    }
  });

  it("rejects net_pay exceeding max", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      net_pay: 10000000000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pf_deduction exceeding max", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      pf_deduction: 99999999999,
    });
    expect(result.success).toBe(false);
  });

  it("rejects tax_deduction exceeding max", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      tax_deduction: 10000000000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects lop_deduction exceeding max", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      lop_deduction: 10000000000,
    });
    expect(result.success).toBe(false);
  });

  // ---------- required fields ----------

  it("rejects missing profile_id", () => {
    const { profile_id, ...rest } = validPayroll;
    const result = createPayrollSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for profile_id", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      profile_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty pay_period", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      pay_period: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects pay_period exceeding 50 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      pay_period: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("accepts pay_period at exactly 50 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      pay_period: "A".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  // ---------- optional fields ----------

  it("accepts when optional fields are omitted", () => {
    const result = createPayrollSchema.safeParse(validPayroll);
    expect(result.success).toBe(true);
  });

  it("accepts null notes", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts notes at exactly 1000 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      notes: "X".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes exceeding 1000 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      notes: "X".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts status string within 50 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      status: "processed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects status exceeding 50 characters", () => {
    const result = createPayrollSchema.safeParse({
      ...validPayroll,
      status: "S".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// ======================== INVOICE SCHEMA TESTS ========================

describe("createInvoiceSchema edge cases", () => {
  const validItem = {
    description: "Consulting services",
    quantity: 10,
    rate: 15000,
    amount: 150000,
  };

  const validInvoice = {
    client_name: "Acme Corp",
    client_email: "billing@acme.com",
    amount: 150000,
    due_date: "2026-03-01",
    items: [validItem],
  };

  // ---------- empty items array ----------

  it("accepts an empty items array (no minimum enforced by schema)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [],
    });
    // z.array() with no .min() allows empty arrays
    expect(result.success).toBe(true);
  });

  // ---------- item quantity ----------

  it("rejects item with zero quantity (positive required)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("quantity"))).toBe(true);
    }
  });

  it("rejects item with negative quantity", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with non-integer quantity", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: 2.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts item with quantity of 1 (minimum positive integer)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts item with quantity at max (999999)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: 999999 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects item with quantity exceeding max (1000000)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, quantity: 1000000 }],
    });
    expect(result.success).toBe(false);
  });

  // ---------- item rate ----------

  it("rejects item with negative rate", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, rate: -100 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("rate"))).toBe(true);
    }
  });

  it("rejects item with fractionally negative rate", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, rate: -0.01 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts item with zero rate (nonnegative allows zero)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, rate: 0, amount: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts item with rate at max (9999999999)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, rate: 9999999999 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects item with rate exceeding max", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, rate: 10000000000 }],
    });
    expect(result.success).toBe(false);
  });

  // ---------- item amount ----------

  it("rejects item with negative amount", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, amount: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts item with zero amount", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, amount: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects item with amount exceeding max", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, amount: 10000000000 }],
    });
    expect(result.success).toBe(false);
  });

  // ---------- item description ----------

  it("rejects item with empty description", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, description: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with whitespace-only description (trimmed to empty)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, description: "   " }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts item with description at exactly 500 characters", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, description: "D".repeat(500) }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects item with description exceeding 500 characters", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ ...validItem, description: "D".repeat(501) }],
    });
    expect(result.success).toBe(false);
  });

  // ---------- client_name ----------

  it("rejects very long client name (over 200 characters)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_name: "A".repeat(201),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("client_name");
    }
  });

  it("accepts client name at exactly 200 characters", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_name: "A".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only client name (trimmed to empty)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string client name", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_name: "",
    });
    expect(result.success).toBe(false);
  });

  // ---------- client_email ----------

  it("rejects email exceeding 255 characters", () => {
    const longLocal = "a".repeat(245);
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_email: `${longLocal}@example.com`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_email: "",
    });
    expect(result.success).toBe(false);
  });

  // ---------- invoice amount ----------

  it("rejects zero invoice amount (positive required)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative invoice amount", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      amount: -500,
    });
    expect(result.success).toBe(false);
  });

  it("accepts invoice amount at max (9999999999)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      amount: 9999999999,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invoice amount exceeding max", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      amount: 10000000000,
    });
    expect(result.success).toBe(false);
  });

  // ---------- due_date ----------

  it("rejects invalid due_date", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      due_date: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid ISO date string for due_date", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      due_date: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  // ---------- multiple items ----------

  it("accepts multiple valid items", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [
        { description: "Item A", quantity: 1, rate: 100, amount: 100 },
        { description: "Item B", quantity: 5, rate: 200, amount: 1000 },
        { description: "Item C", quantity: 3, rate: 50, amount: 150 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when one item in a list is invalid (negative quantity)", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [
        { description: "Valid", quantity: 1, rate: 100, amount: 100 },
        { description: "Bad", quantity: -1, rate: 100, amount: 100 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects when one item in a list has an empty description", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [
        { description: "Valid", quantity: 1, rate: 100, amount: 100 },
        { description: "", quantity: 1, rate: 100, amount: 100 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
