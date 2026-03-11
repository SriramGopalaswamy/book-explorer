import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-creates a bank_transaction entry when a financial document is marked as paid/completed.
 * This keeps the Banking module in sync without manual data entry.
 *
 * @param params.userId - The auth user ID performing the action
 * @param params.amount - Transaction amount (always positive)
 * @param params.type - "credit" for money in (invoice paid), "debit" for money out (bill/expense/reimbursement paid)
 * @param params.description - Human-readable description
 * @param params.reference - Reference ID (invoice number, bill number, etc.)
 * @param params.category - Category for the transaction
 * @param params.date - Transaction date (YYYY-MM-DD)
 */
export async function createBankTransaction(params: {
  userId: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  reference?: string;
  category?: string;
  date?: string;
  organizationId?: string;
}) {
  const { userId, amount, type, description, reference, category, date, organizationId } = params;

  try {
    // Resolve organization_id explicitly to prevent cross-tenant leaks
    let orgId = organizationId;
    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      orgId = profile?.organization_id ?? undefined;
    }

    const { error } = await supabase.from("bank_transactions").insert({
      user_id: userId,
      amount: Math.abs(amount),
      transaction_type: type,
      description,
      reference: reference || null,
      category: category || (type === "credit" ? "Invoice Payment" : "Payment"),
      transaction_date: date || new Date().toISOString().split("T")[0],
      reconciled: false,
      ...(orgId ? { organization_id: orgId } : {}),
    });

    if (error) {
      console.warn(`[BankSync] Failed to create ${type} transaction:`, error.message);
    }
  } catch (err: any) {
    console.warn("[BankSync] Error:", err.message);
  }
}
