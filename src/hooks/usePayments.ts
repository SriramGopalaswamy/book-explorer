import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface PaymentReceipt {
  id: string;
  organization_id: string;
  receipt_number: string;
  customer_id: string | null;
  customer_name: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  bank_account_id: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VendorPayment {
  id: string;
  organization_id: string;
  payment_number: string;
  vendor_id: string | null;
  vendor_name: string;
  bill_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  bank_account_id: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function usePaymentReceipts() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["payment-receipts", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("payment_receipts" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PaymentReceipt[];
    },
    enabled: !!orgId,
  });
}

export function useCreatePaymentReceipt() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: { customer_name: string; customer_id?: string; invoice_id?: string; payment_date: string; amount: number; payment_method: string; reference_number?: string; bank_account_id?: string; notes?: string }) => {
      if (!user) throw new Error("User not authenticated");
      if (r.amount <= 0) throw new Error("Payment amount must be greater than zero.");
      if (!r.customer_name.trim()) throw new Error("Customer name is required.");
      if (!r.payment_date) throw new Error("Payment date is required.");

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      // Prevent future-dated payments
      const today = new Date().toISOString().split("T")[0];
      if (r.payment_date > today) throw new Error("Payment date cannot be in the future.");

      // If linked to invoice, verify invoice exists and payment doesn't exceed remaining balance
      if (r.invoice_id) {
        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .select("amount, status")
          .eq("id", r.invoice_id)
          .single();
        if (invErr || !inv) throw new Error("Linked invoice not found.");
        if (inv.status === "paid") throw new Error("This invoice has already been fully paid.");

        // Sum all existing payments against this invoice
        const { data: existingPayments } = await supabase
          .from("payment_receipts" as any)
          .select("amount")
          .eq("invoice_id", r.invoice_id)
          .eq("status", "completed");
        const totalPaid = (existingPayments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const remainingBalance = Number(inv.amount) - totalPaid;

        if (r.amount > remainingBalance) {
          throw new Error(`Payment (₹${r.amount}) exceeds remaining balance (₹${remainingBalance}).`);
        }
      }

      const num = `REC-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("payment_receipts" as any).insert({
        receipt_number: num,
        customer_name: r.customer_name.trim(),
        customer_id: r.customer_id || null,
        invoice_id: r.invoice_id || null,
        payment_date: r.payment_date,
        amount: r.amount,
        payment_method: r.payment_method,
        reference_number: r.reference_number || null,
        bank_account_id: r.bank_account_id || null,
        notes: r.notes || null,
        created_by: user.id,
        organization_id: profile.organization_id,
      } as any);
      if (error) throw error;

      // ── Auto-update linked invoice status (partial → partially_paid, full → paid) ──
      if (r.invoice_id) {
        const { data: inv } = await supabase
          .from("invoices")
          .select("status, amount")
          .eq("id", r.invoice_id)
          .single();
        if (inv && inv.status !== "paid" && inv.status !== "cancelled") {
          // Sum ALL payments including the one just inserted
          const { data: allPayments } = await supabase
            .from("payment_receipts" as any)
            .select("amount")
            .eq("invoice_id", r.invoice_id)
            .eq("status", "completed");
          const totalPaid = (allPayments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          const invoiceAmount = Number(inv.amount);
          const newStatus = totalPaid >= invoiceAmount ? "paid" : "partially_paid";

          await supabase
            .from("invoices")
            .update({ status: newStatus })
            .eq("id", r.invoice_id);

          // Create bank transaction for every payment (partial or full)
          const { createBankTransaction } = await import("@/lib/bank-transaction-sync");
          await createBankTransaction({
            userId: user.id,
            amount: r.amount,
            type: "credit",
            description: `Payment received: ${num} — ${r.customer_name}`,
            reference: num,
            category: "Invoice Payment",
            date: r.payment_date,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-receipts"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Payment receipt recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useVendorPayments() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["vendor-payments", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("vendor_payments" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as VendorPayment[];
    },
  });
}

export function useCreateVendorPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { vendor_name: string; vendor_id?: string; bill_id?: string; payment_date: string; amount: number; payment_method: string; reference_number?: string; bank_account_id?: string; notes?: string }) => {
      if (!user) throw new Error("User not authenticated");
      if (p.amount <= 0) throw new Error("Payment amount must be greater than zero.");
      if (!p.vendor_name.trim()) throw new Error("Vendor name is required.");
      if (!p.payment_date) throw new Error("Payment date is required.");

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No organization found");

      // Prevent future-dated payments
      const today = new Date().toISOString().split("T")[0];
      if (p.payment_date > today) throw new Error("Payment date cannot be in the future.");

      // If linked to bill, verify bill exists and payment doesn't exceed remaining balance
      if (p.bill_id) {
        const { data: bill, error: billErr } = await supabase
          .from("bills")
          .select("total_amount, status")
          .eq("id", p.bill_id)
          .single();
        if (billErr || !bill) throw new Error("Linked bill not found.");
        if (bill.status === "Paid") throw new Error("This bill has already been fully paid.");

        // Sum all existing vendor payments against this bill
        const { data: existingPayments } = await supabase
          .from("vendor_payments" as any)
          .select("amount")
          .eq("bill_id", p.bill_id)
          .eq("status", "completed");
        const totalPaid = (existingPayments || []).reduce((sum: number, vp: any) => sum + Number(vp.amount), 0);
        const remainingBalance = Number(bill.total_amount) - totalPaid;

        if (p.amount > remainingBalance) {
          throw new Error(`Payment (₹${p.amount}) exceeds remaining balance (₹${remainingBalance}).`);
        }
      }

      const num = `VPAY-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("vendor_payments" as any).insert({
        payment_number: num,
        vendor_name: p.vendor_name.trim(),
        vendor_id: p.vendor_id || null,
        bill_id: p.bill_id || null,
        payment_date: p.payment_date,
        amount: p.amount,
        payment_method: p.payment_method,
        reference_number: p.reference_number || null,
        bank_account_id: p.bank_account_id || null,
        notes: p.notes || null,
        created_by: user.id,
        organization_id: profile.organization_id,
      } as any);
      if (error) throw error;

      // ── Auto-update linked bill status (partial → Partially Paid, full → Paid) ──
      if (p.bill_id) {
        const { data: bill } = await supabase
          .from("bills")
          .select("status, total_amount")
          .eq("id", p.bill_id)
          .single();
        if (bill && bill.status !== "Paid" && bill.status !== "Cancelled") {
          // Sum ALL payments including the one just inserted
          const { data: allPayments } = await supabase
            .from("vendor_payments" as any)
            .select("amount")
            .eq("bill_id", p.bill_id)
            .eq("status", "completed");
          const totalPaid = (allPayments || []).reduce((sum: number, vp: any) => sum + Number(vp.amount), 0);
          const billAmount = Number(bill.total_amount);
          const newStatus = totalPaid >= billAmount ? "Paid" : "Partially Paid";

          await supabase
            .from("bills")
            .update({ status: newStatus })
            .eq("id", p.bill_id);

          // Create bank transaction for every payment (partial or full)
          const { createBankTransaction } = await import("@/lib/bank-transaction-sync");
          await createBankTransaction({
            userId: user.id,
            amount: p.amount,
            type: "debit",
            description: `Vendor payment: ${num} — ${p.vendor_name}`,
            reference: num,
            category: "Bill Payment",
            date: p.payment_date,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Vendor payment recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
