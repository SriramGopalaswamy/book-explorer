import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockInvoices } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  customer_id?: string | null;
  amount: number;
  invoice_date: string;
  due_date: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  created_at: string;
  updated_at: string;
  place_of_supply?: string | null;
  payment_terms?: string | null;
  subtotal?: number;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  total_amount?: number;
  notes?: string | null;
  customer_gstin?: string | null;
  invoice_items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  hsn_sac?: string | null;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  created_at: string;
}

export interface CreateInvoiceData {
  client_name: string;
  client_email: string;
  customer_id?: string;
  amount: number;
  invoice_date?: string;
  due_date: string;
  status?: string;
  place_of_supply?: string;
  payment_terms?: string;
  subtotal?: number;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  total_amount?: number;
  notes?: string;
  customer_gstin?: string;
  items: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    hsn_sac?: string;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
  }[];
}

export interface UpdateInvoiceData extends CreateInvoiceData {
  id: string;
}

export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await supabase.functions.invoke("generate-invoice-pdf", {
    body: { invoiceId },
  });

  if (response.error) throw new Error(response.error.message || "Failed to generate PDF");

  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useInvoices() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["invoices", user?.id, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockInvoices;
      if (!user) return [];

      let query = supabase
        .from("invoices")
        .select(`*, invoice_items (*)`)
        .order("created_at", { ascending: false });

      if (orgId) query = query.eq("organization_id", orgId);

      const { data, error } = await query;
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      if (!user) throw new Error("User not authenticated");

      // ── Input validation ──────────────────────────────────────
      if (!data.client_name?.trim()) throw new Error("Client name is required.");
      if (!data.due_date) throw new Error("Due date is required.");
      if (data.amount <= 0) throw new Error("Invoice amount must be greater than zero.");
      if (!data.items || data.items.length === 0) throw new Error("At least one line item is required.");

      // Validate each line item
      for (const item of data.items) {
        if (!item.description?.trim()) throw new Error("All line items must have a description.");
        if (item.quantity <= 0) throw new Error("Line item quantity must be positive.");
        if (item.rate < 0) throw new Error("Line item rate cannot be negative.");
      }

      // Due date must not be before invoice date
      const invoiceDate = data.invoice_date || new Date().toISOString().split("T")[0];
      if (data.due_date < invoiceDate) {
        throw new Error("Due date cannot be before the invoice date.");
      }

      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          invoice_number: invoiceNumber,
          client_name: data.client_name.trim(),
          client_email: data.client_email,
          customer_id: data.customer_id || null,
          amount: data.amount,
          invoice_date: invoiceDate,
          due_date: data.due_date,
          status: data.status || "draft",
          place_of_supply: data.place_of_supply || null,
          payment_terms: data.payment_terms || "Due on Receipt",
          subtotal: data.subtotal || data.amount,
          cgst_total: data.cgst_total || 0,
          sgst_total: data.sgst_total || 0,
          igst_total: data.igst_total || 0,
          total_amount: data.total_amount || data.amount,
          notes: data.notes || null,
          customer_gstin: data.customer_gstin || null,
        } as any)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      if (data.items && data.items.length > 0) {
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(
            data.items.map((item) => ({
              invoice_id: invoice.id,
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              hsn_sac: item.hsn_sac || null,
              cgst_rate: item.cgst_rate || 0,
              sgst_rate: item.sgst_rate || 0,
              igst_rate: item.igst_rate || 0,
              cgst_amount: item.cgst_amount || 0,
              sgst_amount: item.sgst_amount || 0,
              igst_amount: item.igst_amount || 0,
            }))
          );
        if (itemsError) throw itemsError;
      }

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast({
        title: "Invoice Created",
        description: `Invoice ${invoice.invoice_number} has been created.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create invoice: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Invoice["status"] }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Auto-create bank transaction when invoice is marked as paid (money in)
      if (status === "paid" && data) {
        const { createBankTransaction } = await import("@/lib/bank-transaction-sync");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await createBankTransaction({
            userId: user.id,
            amount: Number(data.amount),
            type: "credit",
            description: `Invoice payment: ${data.invoice_number} — ${data.client_name}`,
            reference: data.invoice_number,
            category: "Invoice Payment",
            date: new Date().toISOString().split("T")[0],
          });
        }
      }

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast({ title: "Status Updated", description: `Invoice status changed to ${variables.status}.` });
      // Fire financial notification
      if (["sent", "paid"].includes(variables.status)) {
        supabase.functions.invoke("send-notification-email", {
          body: { type: "invoice_status_changed", payload: { invoice_id: variables.id, new_status: variables.status } },
        }).catch((err) => console.warn("Failed to send invoice notification:", err));
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update status: ${error.message}`, variant: "destructive" });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateInvoiceData) => {
      // Fetch current version for optimistic locking
      const { data: current, error: fetchErr } = await (supabase as any)
        .from("invoices")
        .select("version")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: invoiceError } = await (supabase as any)
        .from("invoices")
        .update({
          client_name: data.client_name,
          client_email: data.client_email,
          customer_id: data.customer_id || null,
          amount: data.amount,
          invoice_date: data.invoice_date || undefined,
          due_date: data.due_date,
          place_of_supply: data.place_of_supply || null,
          payment_terms: data.payment_terms || "Due on Receipt",
          subtotal: data.subtotal || data.amount,
          cgst_total: data.cgst_total || 0,
          sgst_total: data.sgst_total || 0,
          igst_total: data.igst_total || 0,
          total_amount: data.total_amount || data.amount,
          notes: data.notes || null,
          customer_gstin: data.customer_gstin || null,
        })
        .eq("id", data.id)
        .eq("version", current?.version ?? 1);
      if (invoiceError) throw invoiceError;

      // Delete old items and reinsert
      const { error: deleteError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", data.id);
      if (deleteError) throw deleteError;

      if (data.items && data.items.length > 0) {
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(
            data.items.map((item) => ({
              invoice_id: data.id,
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              hsn_sac: item.hsn_sac || null,
              cgst_rate: item.cgst_rate || 0,
              sgst_rate: item.sgst_rate || 0,
              igst_rate: item.igst_rate || 0,
              cgst_amount: item.cgst_amount || 0,
              sgst_amount: item.sgst_amount || 0,
              igst_amount: item.igst_amount || 0,
            }))
          );
        if (itemsError) throw itemsError;
      }

      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select(`*, invoice_items (*)`)
        .eq("id", data.id)
        .single();
      if (fetchError) throw fetchError;
      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      toast({ title: "Invoice Updated", description: `Invoice ${invoice.invoice_number} has been updated.` });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update invoice: ${error.message}`, variant: "destructive" });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      toast({ title: "Invoice Deleted", description: "The invoice has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to delete invoice: ${error.message}`, variant: "destructive" });
    },
  });
}
