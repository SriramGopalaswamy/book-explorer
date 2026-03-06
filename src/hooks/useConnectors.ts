import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Integration {
  id: string;
  organization_id: string;
  provider: string;
  shop_domain: string | null;
  status: string;
  connected_at: string | null;
  last_sync_at: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface ConnectorLog {
  id: string;
  provider: string;
  event_type: string;
  status: string;
  message: string | null;
  payload: any;
  created_at: string;
}

export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Integration[];
    },
  });
}

export function useIntegration(provider: string) {
  return useQuery({
    queryKey: ["integrations", provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw error;
      return data as Integration | null;
    },
  });
}

export function useConnectProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, shopDomain, metadata }: { provider: string; shopDomain?: string; metadata?: Record<string, string> }) => {
      const domain = shopDomain
        ? shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").trim()
        : null;

      const { data, error } = await supabase
        .from("integrations")
        .upsert(
          {
            provider,
            shop_domain: domain,
            status: "connected",
            connected_at: new Date().toISOString(),
            metadata: metadata || {},
          } as any,
          { onConflict: "organization_id,provider" }
        )
        .select()
        .single();
      if (error) throw error;

      // Log the connection event
      await supabase.from("connector_logs").insert({
        provider,
        event_type: "oauth",
        status: "success",
        message: `Connected ${provider}${domain ? `: ${domain}` : ""}`,
      } as any);

      return data as Integration;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success(`${vars.provider.charAt(0).toUpperCase() + vars.provider.slice(1).replace(/_/g, " ")} connected successfully`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      const { error } = await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          access_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", provider);
      if (error) throw error;

      await supabase.from("connector_logs").insert({
        provider,
        event_type: "oauth",
        status: "info",
        message: `Disconnected ${provider} store`,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Store disconnected");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// Map provider to the correct edge function
const SYNC_FUNCTIONS: Record<string, string> = {
  shopify: "shopify-sync",
  zoho_books: "zoho-sync",
  // Other providers share the shopify-sync generic handler for now
  amazon: "shopify-sync",
  woocommerce: "shopify-sync",
  stripe: "shopify-sync",
  razorpay: "shopify-sync",
};

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      const fnName = SYNC_FUNCTIONS[provider] || "shopify-sync";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { provider },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["shopify-stats"] });
      qc.invalidateQueries({ queryKey: ["connector-logs", vars.provider] });
      toast.success("Sync triggered successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useShopifyStats() {
  return useQuery({
    queryKey: ["shopify-stats"],
    queryFn: async () => {
      const [orders, customers, products] = await Promise.all([
        supabase.from("shopify_orders").select("id, order_total", { count: "exact" }),
        supabase.from("shopify_customers").select("id", { count: "exact" }),
        supabase.from("shopify_products").select("id", { count: "exact" }),
      ]);
      const totalRevenue = ((orders.data || []) as any[]).reduce(
        (s: number, o: any) => s + Number(o.order_total || 0),
        0
      );
      return {
        ordersCount: orders.count || 0,
        customersCount: customers.count || 0,
        productsCount: products.count || 0,
        totalRevenue,
      };
    },
  });
}

export function useConnectorLogs(provider?: string) {
  return useQuery({
    queryKey: ["connector-logs", provider],
    queryFn: async () => {
      let q = supabase
        .from("connector_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (provider) q = q.eq("provider", provider);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ConnectorLog[];
    },
  });
}

// Superadmin: all integrations across all tenants
export function useAllIntegrations() {
  return useQuery({
    queryKey: ["all-integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("status", "connected")
        .order("connected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Integration[];
    },
  });
}
