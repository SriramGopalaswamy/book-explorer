import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ListStateProps {
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  error?: { message?: string } | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  skeletonRows?: number;
  children?: ReactNode;
}

export function ListState({
  isLoading,
  isError,
  isEmpty,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription = "When records are added, they will appear here.",
  emptyAction,
  skeletonRows = 6,
  children,
}: ListStateProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border bg-card p-4 space-y-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-3">
            <Skeleton className="h-10 col-span-2" />
            <Skeleton className="h-10 col-span-3" />
            <Skeleton className="h-10 col-span-2" />
            <Skeleton className="h-10 col-span-2" />
            <Skeleton className="h-10 col-span-2" />
            <Skeleton className="h-10 col-span-1" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border bg-card p-10 text-center space-y-3">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <div>
          <h3 className="font-semibold text-foreground">Could not load data</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message || "An unexpected error occurred."}
          </p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-md border bg-card p-12 text-center space-y-3">
        <Inbox className="h-10 w-10 text-muted-foreground mx-auto" />
        <div>
          <h3 className="font-semibold text-foreground">{emptyTitle}</h3>
          <p className="text-sm text-muted-foreground mt-1">{emptyDescription}</p>
        </div>
        {emptyAction}
      </div>
    );
  }

  return <>{children}</>;
}
