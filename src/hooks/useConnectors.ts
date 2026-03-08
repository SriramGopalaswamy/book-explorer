import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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

// ── Allowed providers whitelist ──
const VALID_PROVIDERS = ["shopify", "zoho_books", "amazon", "woocommerce", "stripe", "razorpay"] as const;
type ValidProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is ValidProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(p);
}

export function useIntegrations() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["integrations", orgId],
    queryFn: async () => {
      let q = supabase.from("integrations").select("*").order("created_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Integration[];
    },
  });
}

export function useIntegration(provider: string) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["integrations", provider, orgId],
    queryFn: async () => {
      let q = supabase.from("integrations").select("*").eq("provider", provider);
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as Integration | null;
    },
  });
}

export function useConnectProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, shopDomain, metadata }: { provider: string; shopDomain?: string; metadata?: Record<string, string> }) => {
      if (!isValidProvider(provider)) throw new Error(`Unsupported provider: ${provider}`);

      const domain = shopDomain
        ? shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").trim()
        : null;

      // Validate Shopify domain format
      if (provider === "shopify" && domain && !domain.includes(".myshopify.com") && !domain.includes(".")) {
        throw new Error("Invalid Shopify domain. Expected format: store-name.myshopify.com");
      }

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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      let q = supabase
        .from("integrations")
        .update({
          status: "disconnected",
          access_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", provider);
      // Scope disconnect to current org
      if (orgId) q = q.eq("organization_id", orgId);

      const { error } = await q;
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
  amazon: "shopify-sync",
  woocommerce: "shopify-sync",
  stripe: "shopify-sync",
  razorpay: "shopify-sync",
};

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider }: { provider: string }) => {
      if (!isValidProvider(provider)) throw new Error(`Unsupported provider: ${provider}`);
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["shopify-stats", orgId],
    queryFn: async () => {
      let ordersQ = supabase.from("shopify_orders").select("id, order_total", { count: "exact" });
      let customersQ = supabase.from("shopify_customers").select("id", { count: "exact" });
      let productsQ = supabase.from("shopify_products").select("id", { count: "exact" });

      if (orgId) {
        ordersQ = ordersQ.eq("organization_id", orgId);
        customersQ = customersQ.eq("organization_id", orgId);
        productsQ = productsQ.eq("organization_id", orgId);
      }

      const [orders, customers, products] = await Promise.all([ordersQ, customersQ, productsQ]);
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["connector-logs", provider, orgId],
    queryFn: async () => {
      let q = supabase
        .from("connector_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (orgId) q = q.eq("organization_id", orgId);
      if (provider) q = q.eq("provider", provider);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ConnectorLog[];
    },
  });
}

// Superadmin: all integrations across all tenants (intentionally unscoped)
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
