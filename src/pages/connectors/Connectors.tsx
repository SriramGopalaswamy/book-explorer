import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plug, ShoppingBag, CreditCard, Package, Globe, Check, AlertTriangle, ArrowRight, Clock, Store } from "lucide-react";
import { useIntegrations, useConnectProvider } from "@/hooks/useConnectors";
import { useNavigate } from "react-router-dom";

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
    id: "shopify",
    name: "Shopify",
    description: "Sync orders, customers, products, and refunds automatically into Books.",
    icon: ShoppingBag,
    fields: [{ key: "shopDomain", label: "Store Domain", placeholder: "your-store.myshopify.com" }],
    connectLabel: "Connect Store",
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Import Amazon seller orders, returns, and settlement data.",
    icon: Package,
    fields: [
      { key: "shopDomain", label: "Seller ID", placeholder: "A1B2C3D4E5F6G7" },
      { key: "marketplace", label: "Marketplace", placeholder: "amazon.in" },
    ],
    connectLabel: "Connect Seller Account",
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
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
    id: "stripe",
    name: "Stripe",
    description: "Auto-import Stripe payments, subscriptions, and payouts.",
    icon: CreditCard,
    fields: [
      { key: "apiKey", label: "Secret Key", placeholder: "sk_live_xxxxxxxxxxxx", type: "password" },
      { key: "shopDomain", label: "Account Name (optional)", placeholder: "My Business" },
    ],
    connectLabel: "Connect Stripe",
  },
  {
    id: "razorpay",
    name: "Razorpay",
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
    id: "zoho_books",
    name: "Zoho Books",
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

export default function Connectors() {
  const { data: integrations = [], isLoading } = useIntegrations();
  const connectProvider = useConnectProvider();
  const navigate = useNavigate();
  const [activeConnector, setActiveConnector] = useState<ConnectorDef | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const getStatus = (providerId: string) => {
    const integration = integrations.find(i => i.provider === providerId);
    return integration?.status || "disconnected";
  };

  const handleConnect = () => {
    if (!activeConnector) return;
    const shopDomain = formValues.shopDomain || formValues.apiKey || "";
    if (!shopDomain.trim() && activeConnector.fields.length > 0) return;

    // Collect metadata from non-shopDomain fields
    const metadata: Record<string, string> = {};
    activeConnector.fields.forEach(f => {
      if (f.key !== "shopDomain" && formValues[f.key]) {
        metadata[f.key] = formValues[f.key];
      }
    });

    connectProvider.mutate(
      {
        provider: activeConnector.id,
        shopDomain: formValues.shopDomain || formValues.apiKey || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      },
      { onSuccess: () => { setActiveConnector(null); setFormValues({}); } }
    );
  };

  const openConnectDialog = (connector: ConnectorDef) => {
    setActiveConnector(connector);
    setFormValues({});
  };

  return (
    <MainLayout title="Connectors" subtitle="Connect external platforms">
      <div className="space-y-6">
        <p className="text-muted-foreground">Connect external platforms and sync business data into your accounting system</p>

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
                    <div className="flex-1">
                      <CardTitle className="text-base">{connector.name}</CardTitle>
                    </div>
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
                    <Button size="sm" className="w-full" onClick={() => openConnectDialog(connector)}>
                      <Plug className="h-3 w-3 mr-1" /> {connector.connectLabel}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Generic Connect Dialog */}
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
            <Button
              onClick={handleConnect}
              disabled={connectProvider.isPending}
              className="w-full"
            >
              {connectProvider.isPending ? "Connecting..." : `Connect ${activeConnector?.name}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
