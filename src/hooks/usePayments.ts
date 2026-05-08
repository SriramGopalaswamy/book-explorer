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
      const { data, error } = await supabase.from("payment_receipts" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500);
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

      // UX-only client-side validation (server enforces the security cases).
      const today = new Date().toISOString().split("T")[0];
      if (r.payment_date > today) throw new Error("Payment date cannot be in the future.");

      // GBC-43: invoice-linked path goes through the atomic RPC. Receipt
      // insert + invoice status flip + bank_transaction insert all run in
      // one transaction. RPC also enforces overpayment server-side.
      if (r.invoice_id) {
        if (!r.bank_account_id) throw new Error("Bank account is required for invoice-linked receipts.");
        const { data, error } = await (supabase as any).rpc("record_payment_receipt", {
          p_invoice_id: r.invoice_id,
          p_amount: r.amount,
          p_payment_method: r.payment_method,
          p_bank_account_id: r.bank_account_id,
          p_reference: r.reference_number ?? null,
          p_payment_date: r.payment_date,
        });
        if (error) throw error;
        return data as string;
      }

      // Unlinked receipt — single insert, no atomicity to preserve.
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found. Please complete onboarding first or contact your administrator.");
      const num = `REC-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("payment_receipts" as any).insert({
        receipt_number: num,
        customer_name: r.customer_name.trim(),
        customer_id: r.customer_id || null,
        invoice_id: null,
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
      const { data, error } = await supabase.from("vendor_payments" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as VendorPayment[];
    },
    enabled: !!orgId,
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

      // UX-only client-side validation (server enforces the security cases).
      const today = new Date().toISOString().split("T")[0];
      if (p.payment_date > today) throw new Error("Payment date cannot be in the future.");

      // GBC-44: bill-linked path goes through the atomic RPC (payment insert
      // + bill status flip + bank_transaction insert all in one tx; server
      // enforces overpayment).
      if (p.bill_id) {
        if (!p.bank_account_id) throw new Error("Bank account is required for bill-linked payments.");
        const { data, error } = await (supabase as any).rpc("record_vendor_payment", {
          p_bill_id: p.bill_id,
          p_amount: p.amount,
          p_payment_method: p.payment_method,
          p_bank_account_id: p.bank_account_id,
          p_reference: p.reference_number ?? null,
          p_payment_date: p.payment_date,
        });
        if (error) throw error;
        return data as string;
      }

      // Unlinked vendor payment — single insert.
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found. Please complete onboarding first or contact your administrator.");
      const num = `VPAY-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("vendor_payments" as any).insert({
        payment_number: num,
        vendor_name: p.vendor_name.trim(),
        vendor_id: p.vendor_id || null,
        bill_id: null,
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
