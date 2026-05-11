import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Modules supported by the `search_documents` RPC. The RPC currently
 * raises for any other module name. sales_orders / purchase_orders are
 * declared here for forward compatibility but not yet implemented
 * server-side — do not pass them into CommandSearch.
 */
export type SearchModule =
  | "customers"
  | "vendors"
  | "items"
  | "invoices"
  | "bills"
  | "sales_orders"
  | "purchase_orders";

export const RPC_SUPPORTED_MODULES: SearchModule[] = [
  "customers",
  "vendors",
  "items",
  "invoices",
  "bills",
];

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

/**
 * GBC-31: Run `search_documents` across every supported module in
 * parallel for a global command palette. Each module is its own
 * React-Query cache entry so a stale result in one module doesn't
 * block others.
 */
export function useSearchDocumentsMulti(
  q: string,
  opts: { limit?: number; modules?: SearchModule[]; minQueryLength?: number } = {},
) {
  const { limit = 5, modules = RPC_SUPPORTED_MODULES, minQueryLength = 2 } = opts;
  const trimmed = (q ?? "").trim();
  const enabled = trimmed.length >= minQueryLength;

  const results = useQueries({
    queries: modules.map((m) => ({
      queryKey: ["search-documents", m, trimmed, limit, 0] as const,
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc("search_documents", {
          p_module: m,
          p_q: trimmed,
          p_limit: limit,
          p_offset: 0,
        });
        if (error) throw error;
        return (data ?? []) as SearchHit[];
      },
      enabled,
      staleTime: 15_000,
    })),
  });

  return {
    enabled,
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    byModule: modules.reduce<Partial<Record<SearchModule, SearchHit[]>>>((acc, m, i) => {
      acc[m] = results[i].data ?? [];
      return acc;
    }, {}),
    totalHits: results.reduce((s, r) => s + (r.data?.length ?? 0), 0),
  };
}

/** Map a search-result module to the list-page route. */
export function moduleToRoute(module: SearchModule): string {
  switch (module) {
    case "customers":       return "/financial/customers";
    case "vendors":         return "/financial/vendors";
    case "items":           return "/inventory/items";
    case "invoices":        return "/financial/invoicing";
    case "bills":           return "/financial/bills";
    case "sales_orders":    return "/sales/orders";
    case "purchase_orders": return "/procurement/purchase-orders";
  }
}

const MODULE_LABEL: Record<SearchModule, string> = {
  customers:       "Customers",
  vendors:         "Vendors",
  items:           "Items",
  invoices:        "Invoices",
  bills:           "Bills",
  sales_orders:    "Sales Orders",
  purchase_orders: "Purchase Orders",
};

export function moduleLabel(module: SearchModule): string {
  return MODULE_LABEL[module];
}
