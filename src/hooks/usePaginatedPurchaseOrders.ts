import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import type { PurchaseOrder } from "@/hooks/usePurchaseOrders";

export interface PurchaseOrderListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}

export interface PaginatedPurchaseOrders {
  rows: PurchaseOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function usePaginatedPurchaseOrders({
  page,
  pageSize,
  search,
  status,
}: PurchaseOrderListParams) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery<PaginatedPurchaseOrders>({
    queryKey: [
      "purchase-orders-paginated",
      orgId,
      page,
      pageSize,
      search ?? "",
      status ?? "all",
    ],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      if (!orgId) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("purchase_orders")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId);

      if (status && status !== "all") q = q.eq("status", status);

      if (search && search.trim()) {
        const s = search.trim().replace(/[,%]/g, "");
        q = q.or(`po_number.ilike.%${s}%,vendor_name.ilike.%${s}%`);
      }

      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const total = count ?? 0;
      return {
        rows: ((data ?? []) as unknown) as PurchaseOrder[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  });
}

export interface PurchaseOrderKpis {
  total_count: number;
  draft_count: number;
  submitted_count: number;
  received_count: number;
  total_value: number;
}

export function usePurchaseOrderKpis() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery<PurchaseOrderKpis>({
    queryKey: ["purchase-order-kpis", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_purchase_order_kpis",
        { p_org_id: orgId },
      );
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) || {};
      return {
        total_count: Number(row.total_count ?? 0),
        draft_count: Number(row.draft_count ?? 0),
        submitted_count: Number(row.submitted_count ?? 0),
        received_count: Number(row.received_count ?? 0),
        total_value: Number(row.total_value ?? 0),
      };
    },
  });
}
