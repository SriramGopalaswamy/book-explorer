import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
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
      // Fetch from bulk_upload_history
      let query = supabase
        .from("bulk_upload_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (module) {
        query = query.eq("module", module);
      }

      const { data: bulkData, error: bulkError } = await query;
      if (bulkError) console.error("bulk_upload_history error:", bulkError.message);

      const bulkRecords = ((bulkData || []) as unknown as UploadRecord[]);

      // Also fetch from attendance_upload_logs when relevant (attendance module or no filter)
      if (!module || module === "attendance") {
        try {
          const { data: attData, error: attError } = await supabase
            .from("attendance_upload_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(20);

          if (attError) console.error("attendance_upload_logs error:", attError.message);

          const attRecords: UploadRecord[] = ((attData || []) as any[]).map((log) => ({
            id: log.id,
            module: "attendance",
            file_name: log.file_name,
            total_rows: log.total_punches || 0,
            successful_rows: log.matched_employees || 0,
            failed_rows: (log.unmatched_codes?.length || 0) + (log.parse_errors?.length || 0),
            errors: [...(log.parse_errors || []), ...(log.unmatched_codes || []).map((c: string) => `Unmatched code: ${c}`)],
            created_at: log.created_at,
          }));

          // Merge and sort by date descending
          const merged = [...bulkRecords, ...attRecords].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          return merged;
        } catch (err) {
          console.warn("Could not fetch attendance_upload_logs:", err);
        }
      }

      return bulkRecords;
    },
  });

  const moduleLabel = (m: string) => {
    const labels: Record<string, string> = {
      payroll: "Payroll",
      payroll_register: "Payroll Register",
      attendance: "Attendance",
      roles: "Roles",
      holidays: "Holidays",
      expenses: "Expenses",
      users: "Users",
    };
    return labels[m] || m;
  };

  const pagination = usePagination(history, 10);

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

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Upload History
          </CardTitle>
          <CardDescription>No bulk uploads recorded yet{module ? ` for ${moduleLabel(module)}` : ""}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

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
            {pagination.paginatedItems.map((record) => (
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
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t">
            <TablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
