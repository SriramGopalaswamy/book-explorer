import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bug, RefreshCw, Mail, MessageCircle, ChevronDown, ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface MessageLog {
  id: string;
  channel: string;
  direction: string;
  status: string;
  entity_type: string;
  entity_id: string;
  from_identifier: string | null;
  to_identifier: string | null;
  content_preview: string | null;
  external_id: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

interface MessageDebugPanelProps {
  organizationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-blue-500/10 text-blue-700 border-blue-200",
  delivered: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  read: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  failed: "bg-red-500/10 text-red-700 border-red-200",
  pending: "bg-amber-500/10 text-amber-700 border-amber-200",
  queued: "bg-muted text-muted-foreground border-border",
};

export function MessageDebugPanel({ organizationId }: MessageDebugPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["message-debug-logs", organizationId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("messages")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as MessageLog[];
    },
  });

  const failedCount = messages.filter((m) => m.status === "failed").length;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Message Debug Panel</h2>
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">
              <AlertTriangle className="h-3 w-3 mr-1" /> {failedCount} failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{messages.length} messages</Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8"></TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>To / From</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-3 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  No messages found. Messages appear here when workflows send emails or WhatsApp messages.
                </TableCell>
              </TableRow>
            ) : (
              messages.map((msg) => (
                <React.Fragment key={msg.id}>
                  <TableRow
                    className={`text-xs cursor-pointer hover:bg-muted/50 transition-colors ${msg.status === "failed" ? "bg-red-500/5" : ""}`}
                    onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                  >
                    <TableCell>
                      {expandedId === msg.id
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {msg.channel === "whatsapp" ? (
                          <MessageCircle className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Mail className="h-3 w-3 text-blue-600" />
                        )}
                        <span className="capitalize">{msg.channel}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] h-4 py-0">
                        {msg.direction}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] h-4 py-0 ${STATUS_COLORS[msg.status] ?? ""}`}>
                        {msg.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">
                      {msg.entity_type}:{msg.entity_id?.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[120px]">
                      {msg.direction === "outbound" ? msg.to_identifier : msg.from_identifier ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {msg.external_id?.slice(0, 12) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>

                  {expandedId === msg.id && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">Message ID</p>
                            <p className="font-mono break-all">{msg.id}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">External ID</p>
                            <p className="font-mono break-all">{msg.external_id ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">Created</p>
                            <p>{format(new Date(msg.created_at), "dd MMM yyyy HH:mm:ss")}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">Updated</p>
                            <p>{format(new Date(msg.updated_at), "dd MMM yyyy HH:mm:ss")}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">From</p>
                            <p>{msg.from_identifier ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">To</p>
                            <p>{msg.to_identifier ?? "—"}</p>
                          </div>
                          {msg.content_preview && (
                            <div className="col-span-full">
                              <p className="text-muted-foreground font-medium mb-1">Content Preview</p>
                              <p className="bg-background rounded p-2 border text-sm">{msg.content_preview}</p>
                            </div>
                          )}
                          {msg.error_message && (
                            <div className="col-span-full">
                              <p className="text-red-600 font-medium mb-1">Error</p>
                              <p className="bg-red-500/5 border border-red-200 rounded p-2 text-red-700 text-sm">
                                {msg.error_message}
                              </p>
                            </div>
                          )}
                          {msg.metadata && Object.keys(msg.metadata).length > 0 && (
                            <div className="col-span-full">
                              <p className="text-muted-foreground font-medium mb-1">Metadata</p>
                              <pre className="bg-background rounded p-2 border text-[10px] overflow-x-auto">
                                {JSON.stringify(msg.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
