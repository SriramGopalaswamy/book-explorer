import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";

export interface Column<T> {
  key: string;
  header: string | ReactNode;
  render?: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  hidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string;
  pageSize?: number;
  paginate?: boolean;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  isLoading,
  emptyMessage = "No records found",
  onRowClick,
  rowClassName,
  pageSize: defaultPageSize = 10,
  paginate = true,
}: DataTableProps<T>) {
  const visibleColumns = columns.filter((col) => !col.hidden);
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems,
    from,
    to,
  } = usePagination(data, defaultPageSize);

  const displayData = paginate ? paginatedItems : data;

  if (isLoading) {
    return (
      <div className="w-full space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-md bg-card">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className={cn("whitespace-nowrap font-semibold", col.headerClassName)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "transition-colors",
                  onRowClick ? "cursor-pointer hover:bg-muted/50" : "",
                  rowClassName?.(item)
                )}
                onClick={() => onRowClick?.(item)}
              >
                {visibleColumns.map((col) => (
                  <TableCell key={`${item.id}-${col.key}`} className={cn("py-3 text-foreground", col.className)}>
                    {col.render ? col.render(item) : (item as any)[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {paginate && totalItems > 10 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          from={from}
          to={to}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
