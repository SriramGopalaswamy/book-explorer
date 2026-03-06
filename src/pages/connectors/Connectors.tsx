import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plug, ShoppingBag, CreditCard, Package, Globe, Check, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { useIntegrations, useConnectShopify } from "@/hooks/useConnectors";
import { useNavigate } from "react-router-dom";

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  comingSoon?: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Sync orders, customers, products, and refunds automatically into Books.",
    icon: ShoppingBag,
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Import Amazon seller orders, returns, and settlement data.",
    icon: Package,
    comingSoon: true,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Connect your WooCommerce store to sync orders and products.",
    icon: Globe,
    comingSoon: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Auto-import Stripe payments, subscriptions, and payouts.",
    icon: CreditCard,
    comingSoon: true,
  },
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Sync Razorpay payments, settlements, and refunds.",
    icon: CreditCard,
    comingSoon: true,
  },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  connected: { label: "Connected", variant: "default", icon: Check },
  disconnected: { label: "Not Connected", variant: "secondary", icon: Clock },
  sync_error: { label: "Sync Error", variant: "destructive", icon: AlertTriangle },
};

export default function Connectors() {
  const { data: integrations = [], isLoading } = useIntegrations();
  const connectShopify = useConnectShopify();
  const navigate = useNavigate();
  const [connectDialog, setConnectDialog] = useState(false);
  const [shopDomain, setShopDomain] = useState("");

  const getStatus = (providerId: string) => {
    const integration = integrations.find(i => i.provider === providerId);
    return integration?.status || "disconnected";
  };

  const handleConnect = () => {
    if (!shopDomain.trim()) return;
    connectShopify.mutate(
      { shopDomain: shopDomain.trim() },
      { onSuccess: () => { setConnectDialog(false); setShopDomain(""); } }
    );
  };

  return (
    <MainLayout title="Connectors" subtitle="Connect external platforms">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
          <p className="text-muted-foreground">Connect external platforms and sync business data into your accounting system</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CONNECTORS.map(connector => {
            const status = connector.comingSoon ? "coming_soon" : getStatus(connector.id);
            const statusInfo = STATUS_MAP[status] || { label: "Coming Soon", variant: "outline" as const, icon: Clock };
            const Icon = connector.icon;

            return (
              <Card key={connector.id} className={`relative overflow-hidden transition-all ${connector.comingSoon ? "opacity-60" : "hover:border-primary/50 hover:shadow-md"}`}>
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
                  {connector.comingSoon ? (
                    <Button variant="outline" size="sm" disabled className="w-full">Coming Soon</Button>
                  ) : status === "connected" ? (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/connectors/${connector.id}`)}>
                      View Details <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full" onClick={() => setConnectDialog(true)}>
                      <Plug className="h-3 w-3 mr-1" /> Connect Store
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Shopify Connect Dialog */}
      <Dialog open={connectDialog} onOpenChange={setConnectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Shopify Store</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your Shopify store domain to connect and start syncing orders, customers, and products.
            </p>
            <div>
              <Label>Store Domain</Label>
              <Input
                placeholder="your-store.myshopify.com"
                value={shopDomain}
                onChange={e => setShopDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">e.g. your-store.myshopify.com</p>
            </div>
            <Button
              onClick={handleConnect}
              disabled={!shopDomain.trim() || connectShopify.isPending}
              className="w-full"
            >
              {connectShopify.isPending ? "Connecting..." : "Connect Store"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
