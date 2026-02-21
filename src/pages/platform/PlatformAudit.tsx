import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { usePlatformAdminLogs } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Loader2 } from "lucide-react";
import { format } from "date-fns";

const actionColors: Record<string, string> = {
  org_switch: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  org_suspended: "bg-destructive/10 text-destructive border-destructive/20",
  org_reactivated: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export default function PlatformAudit() {
  const { data: logs, isLoading } = usePlatformAdminLogs();

  return (
    <PlatformLayout title="Audit Console" subtitle="All superadmin actions are logged here">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Platform Admin Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (logs ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No superadmin actions logged yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Admin ID</TableHead>
                  <TableHead>Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={actionColors[log.action] ?? ""}
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      <div>
                        <span className="font-medium">{log.target_name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {log.target_type}
                          {log.target_id && ` · ${log.target_id.slice(0, 8)}…`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {log.admin_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.metadata && Object.keys(log.metadata as object).length > 0
                        ? JSON.stringify(log.metadata)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PlatformLayout>
  );
}
