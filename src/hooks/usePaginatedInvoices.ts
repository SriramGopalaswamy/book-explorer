import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";
import type { Invoice } from "@/hooks/useInvoices";

export interface InvoiceListParams {
  page: number;        // 1-based
  pageSize: number;
  search?: string;     // ILIKE on invoice_number / client_name / client_email
  status?: string;     // 'all' | invoice status
}

export interface PaginatedInvoices {
  rows: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function usePaginatedInvoices({ page, pageSize, search, status }: InvoiceListParams) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery<PaginatedInvoices>({
    queryKey: ["invoices-paginated", orgId, page, pageSize, search ?? "", status ?? "all"],
    enabled: !!user && !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      if (!orgId) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("invoices")
        .select("*, invoice_items(*)", { count: "exact" })
        .eq("organization_id", orgId);

      if (status && status !== "all") {
        if (status === "overdue") {
          // sent/acknowledged/dispute past due_date OR explicitly overdue
          q = q.or(
            `status.eq.overdue,and(status.in.(sent,acknowledged,dispute),due_date.lt.${new Date()
              .toISOString()
              .slice(0, 10)})`
          );
        } else {
          q = q.eq("status", status);
        }
      }

      if (search && search.trim()) {
        const s = search.trim().replace(/[,%]/g, "");
        q = q.or(
          `invoice_number.ilike.%${s}%,client_name.ilike.%${s}%,client_email.ilike.%${s}%`
        );
      }

      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      const total = count ?? 0;
      return {
        rows: (data ?? []) as Invoice[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  });
}

export interface InvoiceKpis {
  total_outstanding: number;
  total_paid: number;
  overdue_count: number;
  draft_count: number;
  total_count: number;
}

export function useInvoiceKpis() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery<InvoiceKpis>({
    queryKey: ["invoice-kpis", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_invoice_kpis", {
        p_org_id: orgId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) || {};
      return {
        total_outstanding: Number(row.total_outstanding ?? 0),
        total_paid: Number(row.total_paid ?? 0),
        overdue_count: Number(row.overdue_count ?? 0),
        draft_count: Number(row.draft_count ?? 0),
        total_count: Number(row.total_count ?? 0),
      };
    },
  });
}
