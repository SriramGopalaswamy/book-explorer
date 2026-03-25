import { z } from "zod";

// Financial records validation
export const financialRecordSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  category: z.string().trim().min(1, "Category is required").max(100, "Category too long"),
  amount: z.number().positive("Amount must be positive").max(9999999999, "Amount too large"),
  description: z.string().max(500, "Description too long").nullable().optional(),
  record_date: z.string().refine((d) => {
    const date = new Date(d);
    return !isNaN(date.getTime());
  }, "Invalid date format"),
});

// Invoice validation
export const createInvoiceSchema = z.object({
  client_name: z.string().trim().min(1, "Client name is required").max(200, "Client name too long"),
  client_email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  amount: z.number().positive("Amount must be positive").max(9999999999, "Amount too large"),
  due_date: z.string().refine((d) => !isNaN(new Date(d).getTime()), "Invalid date"),
  items: z.array(
    z.object({
      description: z.string().trim().min(1, "Item description required").max(500),
      quantity: z.number().int().positive("Quantity must be positive").max(999999),
      rate: z.number().nonnegative("Rate cannot be negative").max(9999999999),
      amount: z.number().nonnegative("Amount cannot be negative").max(9999999999),
    })
  ),
});

export const updateInvoiceSchema = createInvoiceSchema.extend({
  id: z.string().uuid(),
});

// Bank account validation
export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name required").max(200),
  account_type: z.enum(["Current", "Savings", "FD", "Credit"]),
  // Accepts 6–18 digit account numbers (covers most Indian and international formats)
  account_number: z
    .string()
    .trim()
    .min(6, "Account number must be at least 6 characters")
    .max(18, "Account number must be at most 18 characters")
    .regex(/^[A-Z0-9]+$/i, "Account number must contain only letters and digits"),
  // IFSC: 4 letters + 0 + 6 alphanumeric (Indian standard); optional for non-Indian accounts
  ifsc_code: z
    .string()
    .trim()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must be 11 characters: 4 letters, '0', 6 alphanumeric")
    .optional()
    .or(z.literal("")),
  balance: z.number().max(9999999999, "Balance too large"),
  bank_name: z.string().trim().max(200).optional(),
});

// Bank transaction validation
export const createTransactionSchema = z.object({
  account_id: z.string().uuid("Invalid account"),
  transaction_type: z.enum(["credit", "debit"]),
  amount: z.number().positive("Amount must be positive").max(9999999999, "Amount too large"),
  description: z.string().trim().min(1, "Description required").max(500),
  category: z.string().trim().max(100).optional(),
  transaction_date: z.string().refine((d) => !isNaN(new Date(d).getTime()), "Invalid date"),
});

// Payroll validation
export const createPayrollSchema = z.object({
  profile_id: z.string().uuid("Invalid profile"),
  pay_period: z.string().trim().min(1, "Pay period required").max(50),
  basic_salary: z.number().nonnegative("Cannot be negative").max(9999999999),
  hra: z.number().nonnegative("Cannot be negative").max(9999999999),
  transport_allowance: z.number().nonnegative("Cannot be negative").max(9999999999),
  other_allowances: z.number().nonnegative("Cannot be negative").max(9999999999),
  pf_deduction: z.number().nonnegative("Cannot be negative").max(9999999999),
  tax_deduction: z.number().nonnegative("Cannot be negative").max(9999999999),
  other_deductions: z.number().nonnegative("Cannot be negative").max(9999999999),
  lop_days: z.number().nonnegative("Cannot be negative").max(365).optional(),
  lop_deduction: z.number().nonnegative("Cannot be negative").max(9999999999).optional(),
  working_days: z.number().nonnegative("Cannot be negative").max(365).optional(),
  paid_days: z.number().nonnegative("Cannot be negative").max(365).optional(),
  net_pay: z.number().nonnegative("Cannot be negative").max(9999999999),
  status: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

// Scheduled payment validation
export const createScheduledPaymentSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  amount: z.number().positive("Amount must be positive").max(9999999999),
  due_date: z.string().refine((d) => !isNaN(new Date(d).getTime()), "Invalid date"),
  payment_type: z.enum(["inflow", "outflow"]),
  category: z.string().trim().max(100).optional(),
  recurring: z.boolean().optional(),
  recurrence_interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]).nullable().optional(),
});
