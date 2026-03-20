import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, MessageCircle, RefreshCw, Send, CheckCircle2,
  Eye, Clock, AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

interface Message {
  id: string;
  channel: string;
  direction: string;
  status: string;
  content_preview: string | null;
  from_identifier: string | null;
  to_identifier: string | null;
  created_at: string;
  classification: string | null;
  external_id: string | null;
}

interface InvoiceMessageThreadProps {
  invoiceId: string;
  organizationId: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sent: <Send className="h-3 w-3" />,
  delivered: <CheckCircle2 className="h-3 w-3" />,
  read: <Eye className="h-3 w-3" />,
  failed: <AlertTriangle className="h-3 w-3" />,
  pending: <Clock className="h-3 w-3" />,
};

const STATUS_COLORS: Record<string, string> = {
  sent: "text-blue-600",
  delivered: "text-emerald-600",
  read: "text-emerald-700",
  failed: "text-red-600",
  pending: "text-amber-600",
};

export function InvoiceMessageThread({ invoiceId, organizationId }: InvoiceMessageThreadProps) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["invoice-messages", invoiceId],
    enabled: !!invoiceId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("messages")
        .select("*")
        .eq("entity_type", "invoice")
        .eq("entity_id", invoiceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const sendReminder = useMutation({
    mutationFn: async (channel: string) => {
      const res = await supabase.functions.invoke("messaging-service", {
        body: {
          organization_id: organizationId,
          entity_type: "invoice",
          entity_id: invoiceId,
          channel,
          template: "reminder_1",
        },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (_, channel) => {
      toast({ title: "Reminder sent via " + channel });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4 text-primary" /> Message Thread
        </h3>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => sendReminder.mutate("email")}
                disabled={sendReminder.isPending}
              >
                <Mail className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send Email Reminder</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => sendReminder.mutate("whatsapp")}
                disabled={sendReminder.isPending}
              >
                <MessageCircle className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send WhatsApp Reminder</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Mail className="h-5 w-5 mx-auto mb-2 opacity-40" />
          No messages sent for this invoice yet.
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg border p-3 text-sm ${
                msg.direction === "inbound"
                  ? "bg-primary/5 border-primary/20 ml-0 mr-6"
                  : "bg-card ml-6 mr-0"
              } ${msg.status === "failed" ? "border-red-300 bg-red-500/5" : ""}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {msg.channel === "whatsapp" ? (
                    <Badge variant="outline" className="text-[10px] h-4 py-0 gap-1 bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      <MessageCircle className="h-2.5 w-2.5" /> WhatsApp
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 py-0 gap-1 bg-blue-500/10 text-blue-700 border-blue-200">
                      <Mail className="h-2.5 w-2.5" /> Email
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {msg.direction === "inbound" ? "Received" : "Sent"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`${STATUS_COLORS[msg.status] ?? "text-muted-foreground"}`}>
                    {STATUS_ICONS[msg.status]}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">{msg.status}</span>
                </div>
              </div>

              {msg.content_preview && (
                <p className="text-sm text-foreground mb-1.5 line-clamp-3">{msg.content_preview}</p>
              )}

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {msg.direction === "outbound" ? "To: " : "From: "}
                  {msg.direction === "outbound" ? msg.to_identifier : msg.from_identifier ?? "—"}
                </span>
                <span>{format(new Date(msg.created_at), "dd MMM HH:mm")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
