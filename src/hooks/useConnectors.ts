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
        .from("integrations" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Integration[];
    },
  });
}

export function useIntegration(provider: string) {
  return useQuery({
    queryKey: ["integrations", provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations" as any)
        .select("*")
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Integration | null;
    },
  });
}

export function useConnectShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shopDomain }: { shopDomain: string }) => {
      // Normalize domain
      const domain = shopDomain
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .trim();

      const { data, error } = await supabase
        .from("integrations" as any)
        .upsert(
          {
            provider: "shopify",
            shop_domain: domain,
            status: "connected",
            connected_at: new Date().toISOString(),
          } as any,
          { onConflict: "organization_id,provider" }
        )
        .select()
        .single();
      if (error) throw error;

      // Log event
      await supabase.from("connector_logs" as any).insert({
        provider: "shopify",
        event_type: "oauth",
        status: "success",
        message: `Connected Shopify store: ${domain}`,
      } as any);

      return data as unknown as Integration;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Shopify store connected successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      const { error } = await supabase
        .from("integrations" as any)
        .update({
          status: "disconnected",
          access_token: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("provider", provider);
      if (error) throw error;

      await supabase.from("connector_logs" as any).insert({
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

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      // Call edge function for sync
      const { data, error } = await supabase.functions.invoke("shopify-sync", {
        body: { provider },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["shopify-stats"] });
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
        supabase.from("shopify_orders" as any).select("id, order_total", { count: "exact" }),
        supabase.from("shopify_customers" as any).select("id", { count: "exact" }),
        supabase.from("shopify_products" as any).select("id", { count: "exact" }),
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
        .from("connector_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (provider) q = q.eq("provider", provider);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ConnectorLog[];
    },
  });
}

// Superadmin: all integrations across all tenants
export function useAllIntegrations() {
  return useQuery({
    queryKey: ["all-integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations" as any)
        .select("*")
        .eq("status", "connected")
        .order("connected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Integration[];
    },
  });
}
