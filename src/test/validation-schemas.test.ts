import { describe, it, expect } from "vitest";
import {
  financialRecordSchema,
  createInvoiceSchema,
  createBankAccountSchema,
  createTransactionSchema,
  createPayrollSchema,
  createScheduledPaymentSchema,
} from "@/lib/validation-schemas";

describe("financialRecordSchema", () => {
  it("accepts valid revenue record", () => {
    const result = financialRecordSchema.safeParse({
      type: "revenue",
      category: "Sales",
      amount: 50000,
      description: "Client payment",
      record_date: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty category", () => {
    const result = financialRecordSchema.safeParse({
      type: "expense",
      category: "",
      amount: 100,
      record_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = financialRecordSchema.safeParse({
      type: "revenue",
      category: "Sales",
      amount: -100,
      record_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount exceeding max", () => {
    const result = financialRecordSchema.safeParse({
      type: "revenue",
      category: "Sales",
      amount: 99999999999,
      record_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = financialRecordSchema.safeParse({
      type: "transfer",
      category: "Sales",
      amount: 100,
      record_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date", () => {
    const result = financialRecordSchema.safeParse({
      type: "revenue",
      category: "Sales",
      amount: 100,
      record_date: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("allows null/undefined description", () => {
    const result = financialRecordSchema.safeParse({
      type: "expense",
      category: "Rent",
      amount: 25000,
      record_date: "2026-02-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("createInvoiceSchema", () => {
  const validInvoice = {
    client_name: "Acme Corp",
    client_email: "billing@acme.com",
    amount: 150000,
    due_date: "2026-03-01",
    items: [
      { description: "Consulting", quantity: 10, rate: 15000, amount: 150000 },
    ],
  };

  it("accepts valid invoice", () => {
    expect(createInvoiceSchema.safeParse(validInvoice).success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty client name", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      client_name: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with zero quantity", () => {
    const result = createInvoiceSchema.safeParse({
      ...validInvoice,
      items: [{ description: "Item", quantity: 0, rate: 100, amount: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("createBankAccountSchema", () => {
  it("accepts valid account", () => {
    const result = createBankAccountSchema.safeParse({
      name: "Business Account",
      account_type: "Current",
      account_number: "1234567890",
      balance: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid account type", () => {
    const result = createBankAccountSchema.safeParse({
      name: "Test",
      account_type: "InvalidType",
      account_number: "123",
      balance: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("createTransactionSchema", () => {
  it("rejects zero amount", () => {
    const result = createTransactionSchema.safeParse({
      account_id: "550e8400-e29b-41d4-a716-446655440000",
      transaction_type: "credit",
      amount: 0,
      description: "Test",
      transaction_date: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for account_id", () => {
    const result = createTransactionSchema.safeParse({
      account_id: "not-a-uuid",
      transaction_type: "debit",
      amount: 100,
      description: "Test",
      transaction_date: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("createScheduledPaymentSchema", () => {
  it("accepts valid scheduled payment", () => {
    const result = createScheduledPaymentSchema.safeParse({
      name: "Monthly Rent",
      amount: 50000,
      due_date: "2026-03-01",
      payment_type: "outflow",
      recurring: true,
      recurrence_interval: "monthly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid payment type", () => {
    const result = createScheduledPaymentSchema.safeParse({
      name: "Test",
      amount: 100,
      due_date: "2026-01-01",
      payment_type: "unknown",
    });
    expect(result.success).toBe(false);
  });
});
