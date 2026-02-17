import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

interface UploadRecord {
  id: string;
  module: string;
  file_name: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  errors: string[];
  created_at: string;
}

export function BulkUploadHistory({ module }: { module?: string }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["bulk-upload-history", module],
    queryFn: async () => {
      let query = supabase
        .from("bulk_upload_history" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (module) {
        query = query.eq("module", module);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as UploadRecord[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) return null;

  const moduleLabel = (m: string) => {
    const labels: Record<string, string> = {
      payroll: "Payroll",
      attendance: "Attendance",
      roles: "Roles",
    };
    return labels[m] || m;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Upload History
        </CardTitle>
        <CardDescription>Recent bulk upload activity{module ? ` for ${moduleLabel(module)}` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {!module && <TableHead>Module</TableHead>}
              <TableHead>File</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Success</TableHead>
              <TableHead className="text-center">Failed</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((record) => (
              <TableRow key={record.id}>
                {!module && (
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{moduleLabel(record.module)}</Badge>
                  </TableCell>
                )}
                <TableCell className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-[180px]">{record.file_name}</span>
                </TableCell>
                <TableCell className="text-center text-sm">{record.total_rows}</TableCell>
                <TableCell className="text-center text-sm text-green-600">{record.successful_rows}</TableCell>
                <TableCell className="text-center text-sm text-destructive">
                  {record.failed_rows > 0 ? record.failed_rows : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(record.created_at), "MMM d, yyyy h:mm a")}
                </TableCell>
                <TableCell>
                  {record.failed_rows === 0 ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Success
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Partial
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
