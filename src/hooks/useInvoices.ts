import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockInvoices } from "@/lib/mock-data";
import { checkApprovalGate, createApprovalRequest } from "@/lib/approval-gate";
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
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "acknowledged" | "dispute";
  created_at: string;
  updated_at: string;
  client_phone?: string | null;
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
  // Aadhaar eSign fields
  signing_status?: 'not_initiated' | 'pending_download' | 'pending_upload' | 'verifying' | 'verified' | 'failed' | null;
  original_pdf_path?: string | null;
  signed_pdf_path?: string | null;
  signing_initiated_at?: string | null;
  signing_completed_at?: string | null;
  signing_failure_reason?: string | null;
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
  client_phone?: string;
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

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ invoiceId }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Failed to generate PDF (${response.status})`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
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
      if (!user || !orgId) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select(`*, invoice_items (*)`)
        .eq("is_deleted", false)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
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

      // ── Fiscal period guard ──
      const { validateFiscalPeriod } = await import("@/lib/fiscal-period-guard");
      await validateFiscalPeriod(invoiceDate);

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
          client_phone: data.client_phone || null,
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
        if (itemsError) {
          // Atomic rollback: delete orphaned invoice header
          await supabase.from("invoices").delete().eq("id", invoice.id);
          throw itemsError;
        }
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
      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // ── Lifecycle state-machine enforcement ───────────────────
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ["sent", "cancelled"],
        sent: ["paid", "overdue", "cancelled"],
        overdue: ["paid", "cancelled"],
        paid: [],           // terminal
        cancelled: [],      // terminal
        acknowledged: ["paid", "cancelled"],  // AI-set; can still be paid
        dispute: ["sent", "cancelled"],       // AI-set; can re-send or cancel
      };

      // Fetch current status to validate transition (org-scoped)
      const { data: current, error: fetchErr } = await supabase
        .from("invoices")
        .select("status, amount, invoice_number")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!current) throw new Error("Invoice not found in your organization.");
      const currentStatus = current?.status as string;

      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot change invoice status from "${currentStatus}" to "${status}".`);
      }

      // ── Approval gate: check if this transition requires approval ──
      if (status === "sent" || status === "paid") {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const gate = await checkApprovalGate("invoice", Number(current?.amount || 0));
          if (gate.requiresApproval) {
            await createApprovalRequest({
              workflowId: gate.workflowId!,
              documentType: "invoice",
              documentId: id,
              documentNumber: current?.invoice_number || null,
              documentAmount: Number(current?.amount || 0),
              requestedBy: authUser.id,
              notes: `Approval required to change status to "${status}"`,
            });
            throw new Error(`This invoice exceeds the ₹${gate.thresholdAmount?.toLocaleString()} approval threshold. An approval request has been created.`);
          }
        }
      }

      const { data, error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id)
        .eq("organization_id", callerOrgId)
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

      // Auto-cancel running workflow_runs when invoice reaches a terminal state
      // (paid, acknowledged, dispute, cancelled) to prevent further reminder emails.
      const terminalStatuses = ["paid", "acknowledged", "dispute", "cancelled"];
      if (terminalStatuses.includes(status)) {
        try {
          await (supabase.from as any)("workflow_runs")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("entity_type", "invoice")
            .eq("entity_id", id)
            .eq("status", "running");
        } catch (err: any) {
          console.warn("Failed to cancel workflow runs:", err);
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
      queryClient.invalidateQueries({ queryKey: ["workflow-runs-invoice", variables.id] });
      toast({ title: "Status Updated", description: `Invoice status changed to ${variables.status}.` });
      // Fire financial notification (only for paid — avoid duplicate comms on sent)
      if (variables.status === "paid") {
        supabase.functions.invoke("send-notification-email", {
          body: { type: "invoice_status_changed", payload: { invoice_id: variables.id, new_status: variables.status } },
        }).catch((err) => console.warn("Failed to send invoice notification:", err));
      }
      // Trigger workflow engine when invoice is sent
      if (variables.status === "sent" && data?.organization_id) {
        supabase.functions.invoke("workflow-event", {
          body: {
            event_type: "invoice_sent",
            entity_type: "invoice",
            entity_id: variables.id,
            organization_id: data.organization_id,
            payload: { invoice_id: variables.id, status: "sent" },
          },
        }).catch((err) => console.warn("Failed to trigger workflow event:", err));
      }
      // Trigger invoice_acknowledged event when status changes to acknowledged
      if (variables.status === "acknowledged" && data?.organization_id) {
        supabase.functions.invoke("workflow-event", {
          body: {
            event_type: "invoice_acknowledged",
            entity_type: "invoice",
            entity_id: variables.id,
            organization_id: data.organization_id,
            payload: { invoice_id: variables.id, status: "acknowledged", source: "manual" },
          },
        }).catch((err) => console.warn("Failed to trigger invoice_acknowledged event:", err));
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
      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // ── Only drafts can be fully edited ───────────────────────
      const { data: statusCheck, error: statusErr } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", data.id)
        .eq("organization_id", callerOrgId)
        .single();
      if (statusErr) throw statusErr;
      if (!statusCheck) throw new Error("Invoice not found in your organization.");
      if (statusCheck?.status !== "draft") {
        throw new Error("Only draft invoices can be edited. Change status back to draft first.");
      }

      if (data.amount <= 0) throw new Error("Invoice amount must be greater than zero.");
      if (!data.client_name?.trim()) throw new Error("Client name is required.");

      // Build update payload
      const updatePayload: Record<string, any> = {
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
        client_phone: data.client_phone || null,
      };

      const { data: updateResult, error: invoiceError } = await (supabase as any)
        .from("invoices")
        .update(updatePayload)
        .eq("id", data.id)
        .eq("organization_id", callerOrgId)
        .select();
      if (invoiceError) throw invoiceError;
      if (!updateResult || updateResult.length === 0) {
        throw new Error("Failed to update invoice. Please refresh and try again.");
      }

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
      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // ── Only drafts can be deleted ────────────────────────────
      const { data: inv, error: checkErr } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .single();
      if (checkErr) throw checkErr;
      if (!inv) throw new Error("Invoice not found in your organization.");
      if (inv?.status && inv.status !== "draft") {
        throw new Error(`Cannot delete a "${inv.status}" invoice. Only draft invoices can be deleted.`);
      }

      const { error } = await supabase
        .from("invoices")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("organization_id", callerOrgId);
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
