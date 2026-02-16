import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { createInvoiceSchema, updateInvoiceSchema } from "@/lib/validation-schemas";

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  created_at: string;
  updated_at: string;
  invoice_items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface CreateInvoiceData {
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  items: Omit<InvoiceItem, "id" | "invoice_id" | "created_at">[];
}

export interface UpdateInvoiceData {
  id: string;
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  items: Omit<InvoiceItem, "id" | "invoice_id" | "created_at">[];
}

export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("generate-invoice-pdf", {
    body: { invoiceId },
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to generate PDF");
  }

  // The response.data is already a Blob when Content-Type is application/pdf
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

  return useQuery({
    queryKey: ["invoices", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          invoice_items (*)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!user,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      if (!user) throw new Error("User not authenticated");

      const validated = createInvoiceSchema.parse(data);

      // Use atomic RPC function to create invoice with items
      // This prevents orphaned invoices if items insertion fails
      // Addresses CRITICAL Issue #3 from system audit
      const { data: invoiceId, error: rpcError } = await supabase.rpc(
        "create_invoice_with_items",
        {
          p_client_name: validated.client_name,
          p_client_email: validated.client_email,
          p_amount: validated.amount,
          p_due_date: validated.due_date,
          p_items: JSON.stringify(validated.items),
        }
      );

      if (rpcError) throw rpcError;
      if (!invoiceId) throw new Error("Failed to create invoice");

      // Fetch the created invoice with items
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select(`
          *,
          invoice_items (*)
        `)
        .eq("id", invoiceId)
        .single();

      if (fetchError) throw fetchError;

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Invoice Created",
        description: `Invoice ${invoice.invoice_number} has been created as a draft.`,
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
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Status Updated",
        description: `Invoice status changed to ${variables.status}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateInvoiceData) => {
      const validated = updateInvoiceSchema.parse(data);

      // Use atomic RPC function to update invoice with items
      // This prevents data loss if items insertion fails
      // Addresses CRITICAL Issue #3 from system audit
      const { data: invoiceId, error: rpcError } = await supabase.rpc(
        "update_invoice_with_items",
        {
          p_invoice_id: validated.id,
          p_client_name: validated.client_name,
          p_client_email: validated.client_email,
          p_amount: validated.amount,
          p_due_date: validated.due_date,
          p_items: JSON.stringify(validated.items),
        }
      );

      if (rpcError) throw rpcError;
      if (!invoiceId) throw new Error("Failed to update invoice");

      // Fetch the updated invoice with items
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select(`
          *,
          invoice_items (*)
        `)
        .eq("id", invoiceId)
        .single();

      if (fetchError) throw fetchError;

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Invoice Updated",
        description: `Invoice ${invoice.invoice_number} has been updated.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update invoice: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Invoice Deleted",
        description: "The invoice has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete invoice: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}
