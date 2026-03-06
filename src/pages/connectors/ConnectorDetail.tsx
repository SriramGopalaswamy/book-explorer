import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useParams, useNavigate } from "react-router-dom";
import { useIntegration, useDisconnectIntegration, useTriggerSync, useShopifyStats, useConnectorLogs } from "@/hooks/useConnectors";
import { ShoppingBag, Users, Package, IndianRupee, RefreshCw, Unplug, Activity, ArrowLeft, CreditCard, Globe } from "lucide-react";
import { format } from "date-fns";

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  shopify: ShoppingBag,
  amazon: Package,
  woocommerce: Globe,
  stripe: CreditCard,
  razorpay: CreditCard,
};

const PROVIDER_LABELS: Record<string, string> = {
  shopify: "Shopify",
  amazon: "Amazon",
  woocommerce: "WooCommerce",
  stripe: "Stripe",
  razorpay: "Razorpay",
};

export default function ConnectorDetail() {
  const { provider } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const { data: integration, isLoading } = useIntegration(provider || "shopify");
  const { data: stats } = useShopifyStats();
  const { data: logs = [] } = useConnectorLogs(provider);
  const disconnect = useDisconnectIntegration();
  const triggerSync = useTriggerSync();

  if (isLoading) {
    return (
      <MainLayout title="Connector Details">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!integration || integration.status === "disconnected") {
    return (
      <MainLayout title="Connector Details">
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">This connector is not connected.</p>
          <Button onClick={() => navigate("/connectors")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Connectors
          </Button>
        </div>
      </MainLayout>
    );
  }

  const ProviderIcon = PROVIDER_ICONS[provider || "shopify"] || ShoppingBag;
  const providerLabel = PROVIDER_LABELS[provider || "shopify"] || provider;

  const statusColor = integration.status === "connected"
    ? "bg-primary/20 text-primary"
    : integration.status === "sync_error"
    ? "bg-destructive/20 text-destructive"
    : "bg-muted text-muted-foreground";

  const handleDisconnect = () => {
    disconnect.mutate({ provider: provider || "shopify" }, {
      onSuccess: () => navigate("/connectors"),
    });
  };

  return (
    <MainLayout title="Connector Details" subtitle={integration.shop_domain || provider}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/connectors")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <ProviderIcon className="h-6 w-6 text-primary" />
                {providerLabel} Integration
              </h1>
              <p className="text-muted-foreground">{integration.shop_domain}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => triggerSync.mutate({ provider: provider || "shopify" })}
              disabled={triggerSync.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${triggerSync.isPending ? "animate-spin" : ""}`} />
              {triggerSync.isPending ? "Syncing..." : "Sync Now"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Unplug className="h-4 w-4 mr-1" /> Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Store?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the connection to your {provider} store. Historical imported data will be preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Connection Info */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Store Domain</p>
                <p className="font-medium text-foreground">{integration.shop_domain || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className={statusColor}>{integration.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Connected At</p>
                <p className="text-sm text-foreground">{integration.connected_at ? format(new Date(integration.connected_at), "dd MMM yyyy HH:mm") : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Sync</p>
                <p className="text-sm text-foreground">{integration.last_sync_at ? format(new Date(integration.last_sync_at), "dd MMM yyyy HH:mm") : "Never"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.ordersCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Orders Imported</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-accent-foreground" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.customersCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Customers Imported</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.productsCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Products Imported</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <IndianRupee className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    ₹{(stats?.totalRevenue || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">Revenue Synced</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs */}
        <Tabs defaultValue="logs">
          <TabsList>
            <TabsTrigger value="logs"><Activity className="h-4 w-4 mr-1" />Activity Log</TabsTrigger>
          </TabsList>
          <TabsContent value="logs">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), "dd MMM HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{log.event_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status === "error" ? "destructive" : log.status === "success" ? "default" : "secondary"}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{log.message || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No activity logged yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
