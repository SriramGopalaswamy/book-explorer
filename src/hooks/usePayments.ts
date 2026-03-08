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
      let q = supabase.from("payment_receipts" as any).select("*").order("created_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PaymentReceipt[];
    },
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

      // Prevent future-dated payments
      const today = new Date().toISOString().split("T")[0];
      if (r.payment_date > today) throw new Error("Payment date cannot be in the future.");

      // If linked to invoice, verify invoice exists and payment doesn't exceed balance
      if (r.invoice_id) {
        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .select("amount, status")
          .eq("id", r.invoice_id)
          .single();
        if (invErr || !inv) throw new Error("Linked invoice not found.");
        if (inv.status === "paid") throw new Error("This invoice has already been fully paid.");
        if (r.amount > Number(inv.amount)) {
          throw new Error(`Payment (₹${r.amount}) exceeds invoice amount (₹${inv.amount}).`);
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
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment-receipts"] }); toast.success("Payment receipt recorded"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useVendorPayments() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["vendor-payments", orgId],
    queryFn: async () => {
      let q = supabase.from("vendor_payments" as any).select("*").order("created_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
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
      if (p.amount <= 0) throw new Error("Payment amount must be greater than zero.");
      if (!p.vendor_name.trim()) throw new Error("Vendor name is required.");

      const num = `VPAY-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("vendor_payments" as any).insert({
        payment_number: num,
        vendor_name: p.vendor_name,
        vendor_id: p.vendor_id || null,
        bill_id: p.bill_id || null,
        payment_date: p.payment_date,
        amount: p.amount,
        payment_method: p.payment_method,
        reference_number: p.reference_number || null,
        bank_account_id: p.bank_account_id || null,
        notes: p.notes || null,
        created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-payments"] }); toast.success("Vendor payment recorded"); },
    onError: (e: any) => toast.error(e.message),
  });
}
