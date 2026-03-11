import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plug, ShoppingBag, CreditCard, Package, Globe, Check, AlertTriangle,
  ArrowRight, Clock, Store, Bot, Cpu, Terminal, Copy, CheckCheck,
} from "lucide-react";
import { useIntegrations, useConnectProvider } from "@/hooks/useConnectors";
import { useNavigate } from "react-router-dom";
import { MCP_MODULES, MCP_TOTAL_TOOLS, MCP_VERSION, MCP_SERVER_NAME } from "@/data/mcpModules";

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  connectLabel: string;
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: "shopify", name: "Shopify",
    description: "Sync orders, customers, products, and refunds automatically into Books.",
    icon: ShoppingBag,
    fields: [{ key: "shopDomain", label: "Store Domain", placeholder: "your-store.myshopify.com" }],
    connectLabel: "Connect Store",
  },
  {
    id: "amazon", name: "Amazon",
    description: "Import Amazon seller orders, returns, and settlement data.",
    icon: Package,
    fields: [
      { key: "shopDomain", label: "Seller ID", placeholder: "A1B2C3D4E5F6G7" },
      { key: "marketplace", label: "Marketplace", placeholder: "amazon.in" },
    ],
    connectLabel: "Connect Seller Account",
  },
  {
    id: "woocommerce", name: "WooCommerce",
    description: "Connect your WooCommerce store to sync orders and products.",
    icon: Globe,
    fields: [
      { key: "shopDomain", label: "Store URL", placeholder: "your-store.com" },
      { key: "consumerKey", label: "Consumer Key", placeholder: "ck_xxxxxxxxxxxx" },
      { key: "consumerSecret", label: "Consumer Secret", placeholder: "cs_xxxxxxxxxxxx", type: "password" },
    ],
    connectLabel: "Connect Store",
  },
  {
    id: "stripe", name: "Stripe",
    description: "Auto-import Stripe payments, subscriptions, and payouts.",
    icon: CreditCard,
    fields: [
      { key: "apiKey", label: "Secret Key", placeholder: "sk_live_xxxxxxxxxxxx", type: "password" },
      { key: "shopDomain", label: "Account Name (optional)", placeholder: "My Business" },
    ],
    connectLabel: "Connect Stripe",
  },
  {
    id: "razorpay", name: "Razorpay",
    description: "Sync Razorpay payments, settlements, and refunds.",
    icon: CreditCard,
    fields: [
      { key: "apiKey", label: "Key ID", placeholder: "rzp_live_xxxxxxxxxxxx" },
      { key: "apiSecret", label: "Key Secret", placeholder: "xxxxxxxxxxxx", type: "password" },
      { key: "shopDomain", label: "Account Label (optional)", placeholder: "My Business" },
    ],
    connectLabel: "Connect Razorpay",
  },
  {
    id: "zoho_books", name: "Zoho Books",
    description: "Import invoices, bills, contacts, and chart of accounts from Zoho Books.",
    icon: Store,
    fields: [
      { key: "shopDomain", label: "Zoho Organization ID", placeholder: "123456789" },
      { key: "apiKey", label: "OAuth Client ID", placeholder: "1000.XXXXXXXXXX" },
      { key: "apiSecret", label: "OAuth Client Secret", placeholder: "xxxxxxxxxxxx", type: "password" },
    ],
    connectLabel: "Connect Zoho Books",
  },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  connected: { label: "Connected", variant: "default", icon: Check },
  disconnected: { label: "Not Connected", variant: "secondary", icon: Clock },
  sync_error: { label: "Sync Error", variant: "destructive", icon: AlertTriangle },
};

const MCP_CONFIG_SNIPPET = JSON.stringify({
  mcpServers: {
    "grx10-books": {
      command: "npx",
      args: ["tsx", "mcp-server/src/server.ts"],
      env: {
        SUPABASE_URL: "<your-supabase-url>",
        SUPABASE_SERVICE_ROLE_KEY: "<your-service-role-key>",
      },
    },
  },
}, null, 2);

export default function Connectors() {
  const { data: integrations = [] } = useIntegrations();
  const connectProvider = useConnectProvider();
  const navigate = useNavigate();
  const [activeConnector, setActiveConnector] = useState<ConnectorDef | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const getStatus = (providerId: string) => {
    const integration = integrations.find(i => i.provider === providerId);
    return integration?.status || "disconnected";
  };

  const handleConnect = () => {
    if (!activeConnector) return;
    const shopDomain = formValues.shopDomain || formValues.apiKey || "";
    if (!shopDomain.trim() && activeConnector.fields.length > 0) return;
    const metadata: Record<string, string> = {};
    activeConnector.fields.forEach(f => {
      if (f.key !== "shopDomain" && formValues[f.key]) metadata[f.key] = formValues[f.key];
    });
    connectProvider.mutate(
      { provider: activeConnector.id, shopDomain: formValues.shopDomain || formValues.apiKey || undefined, metadata: Object.keys(metadata).length > 0 ? metadata : undefined },
      { onSuccess: () => { setActiveConnector(null); setFormValues({}); } }
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(MCP_CONFIG_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <MainLayout title="Connectors" subtitle="Connect external platforms and AI agents">
      <div className="space-y-8">

        {/* ── AI Agent / MCP ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">AI Agent Layer (MCP)</h2>
              <p className="text-sm text-muted-foreground">
                Connect Claude Desktop, Cursor, n8n, or any MCP-compatible agent to your ERP data
              </p>
            </div>
            <Badge className="ml-auto gap-1">
              {MCP_TOTAL_TOOLS} tools · {MCP_MODULES.length} modules
            </Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Server info card */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> MCP Server
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "Name", value: MCP_SERVER_NAME },
                  { label: "Version", value: MCP_VERSION },
                  { label: "Transport", value: "stdio" },
                  { label: "Tools", value: String(MCP_TOTAL_TOOLS) },
                  { label: "Modules", value: String(MCP_MODULES.length) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs font-medium">{value}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/admin/mcp-tools")}>
                  <ArrowRight className="h-3 w-3 mr-1" /> Explore All Tools
                </Button>
              </CardContent>
            </Card>

            {/* Modules grid */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Available Modules</CardTitle>
                <CardDescription className="text-xs">Each module exposes ERP data as structured AI tools</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {MCP_MODULES.map((mod) => (
                    <div
                      key={mod.id}
                      title={mod.description}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs bg-muted/50 hover:bg-muted cursor-default transition-colors"
                    >
                      <span>{mod.emoji}</span>
                      <span className="font-medium">{mod.label}</span>
                      <span className="text-muted-foreground">({mod.tools.length})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Config snippet */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4" /> Claude Desktop / Cursor Config
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
                  {copied ? <><CheckCheck className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </Button>
              </div>
              <CardDescription className="text-xs">
                Add to <code className="bg-muted px-1 rounded text-[10px]">claude_desktop_config.json</code> or Cursor MCP settings, then fill in your Supabase credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/70 rounded-lg p-3 overflow-x-auto text-muted-foreground leading-relaxed">
                {MCP_CONFIG_SNIPPET}
              </pre>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* ── Data sync connectors ───────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
              <Plug className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Data Sync Connectors</h2>
              <p className="text-sm text-muted-foreground">Sync business data from external platforms into your accounting system</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CONNECTORS.map(connector => {
              const status = getStatus(connector.id);
              const statusInfo = STATUS_MAP[status] || STATUS_MAP.disconnected;
              const Icon = connector.icon;
              return (
                <Card key={connector.id} className="relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
                  {status === "connected" && (
                    <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                      <div className="absolute top-2 right-[-20px] w-[80px] bg-primary text-primary-foreground text-[10px] font-semibold text-center rotate-45">
                        Active
                      </div>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">{connector.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <CardDescription className="text-sm">{connector.description}</CardDescription>
                    <div className="mt-3">
                      <Badge variant={statusInfo.variant} className="gap-1">
                        <statusInfo.icon className="h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    {status === "connected" ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/connectors/${connector.id}`)}>
                        View Details <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => { setActiveConnector(connector); setFormValues({}); }}>
                        <Plug className="h-3 w-3 mr-1" /> {connector.connectLabel}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Connect Dialog */}
      <Dialog open={!!activeConnector} onOpenChange={v => { if (!v) { setActiveConnector(null); setFormValues({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeConnector && <activeConnector.icon className="h-5 w-5 text-primary" />}
              Connect {activeConnector?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your {activeConnector?.name} credentials to connect and start syncing data.
            </p>
            {activeConnector?.fields.map(field => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Input
                  type={field.type || "text"}
                  placeholder={field.placeholder}
                  value={formValues[field.key] || ""}
                  onChange={e => setFormValues(p => ({ ...p, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <Button onClick={handleConnect} disabled={connectProvider.isPending} className="w-full">
              {connectProvider.isPending ? "Connecting..." : `Connect ${activeConnector?.name}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
