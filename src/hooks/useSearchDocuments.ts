import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SearchModule =
  | "customers"
  | "vendors"
  | "items"
  | "invoices"
  | "bills"
  | "sales_orders"
  | "purchase_orders";

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string | null;
  total_count: number;
}

/**
 * Server-side paginated, org-scoped, FTS-friendly search across the major
 * document modules. Backed by the `search_documents` RPC.
 */
export function useSearchDocuments(
  module: SearchModule,
  q: string,
  opts: { limit?: number; offset?: number; enabled?: boolean } = {},
) {
  const { limit = 25, offset = 0, enabled = true } = opts;

  return useQuery({
    queryKey: ["search-documents", module, q, limit, offset],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_documents", {
        p_module: module,
        p_q: q ?? "",
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data ?? []) as SearchHit[];
      return {
        rows,
        total: rows[0]?.total_count ?? 0,
      };
    },
    enabled,
    staleTime: 15_000,
  });
}
