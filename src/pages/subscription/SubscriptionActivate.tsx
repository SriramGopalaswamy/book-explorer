import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import grx10Logo from "@/assets/grx10-logo.webp";

export default function SubscriptionActivate() {
  const [passkey, setPasskey] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { needsActivation, loading: subLoading } = useSubscription();
  const { data: org } = useUserOrganization();

  const redeemMutation = useMutation({
    mutationFn: async (key: string) => {
      if (!org?.organizationId) throw new Error("Organization not found");
      const { data, error } = await supabase.rpc("redeem_subscription_key", {
        _passkey: key,
        _org_id: org.organizationId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Redemption failed");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`Subscription activated! Plan: ${data.plan}`);
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["user-organization"] });
      setTimeout(() => navigate("/onboarding", { replace: true }), 500);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = passkey.trim();
    if (!trimmed) {
      toast.error("Please enter a subscription key");
      return;
    }
    redeemMutation.mutate(trimmed);
  };

  // If already has active subscription, redirect (via useEffect, not render)
  if (!subLoading && !needsActivation && org) {
    const target = org.orgState === "active" ? "/" : "/onboarding";
    return <Navigate to={target} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4">
          <img src={grx10Logo} alt="GRX10" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Activate Your Subscription</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your subscription key to get started with GRX10 Books
            </p>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Subscription Key
            </CardTitle>
            <CardDescription>
              Your subscription key was provided by your platform administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                placeholder="Enter your 24-character key"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value.toUpperCase())}
                maxLength={24}
                className="font-mono text-center text-lg tracking-widest"
                disabled={redeemMutation.isPending}
                autoFocus
              />
              <Button
                type="submit"
                className="w-full"
                disabled={redeemMutation.isPending || passkey.trim().length === 0}
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Activating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Activate Subscription
                  </>
                )}
              </Button>

              {redeemMutation.isError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{redeemMutation.error.message}</span>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need a subscription key? Contact your platform administrator.
        </p>
      </div>
    </div>
  );
}
