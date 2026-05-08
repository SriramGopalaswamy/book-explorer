import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataLoadingBarProps {
  /** When true, shows the bar. When false, the component renders nothing. */
  isLoading: boolean;
  /** Number of rows already received from the server (optional). */
  loaded?: number;
  /** Total expected rows (optional). When omitted, an indeterminate bar is shown. */
  total?: number;
  /** Short label, e.g. "Loading employees" */
  label?: string;
  className?: string;
}

/**
 * Shared "the data is on its way" affordance for slow tabular screens.
 * - When `total` is unknown, animates an indeterminate magenta sweep so users
 *   know the network is active.
 * - When both `loaded` and `total` are known, renders a determinate bar with
 *   a "X of Y rows" hint — soothes UI loading anxiety on Employees, Payroll,
 *   bulk uploads, etc.
 *
 * Pure presentational; no business logic. Pair with TanStack Query's
 * `isLoading` / `isFetching` and (optionally) the row count of the
 * previously cached page.
 */
export function DataLoadingBar({
  isLoading,
  loaded,
  total,
  label = "Loading data",
  className,
}: DataLoadingBarProps) {
  // Smoothly fade in after 200ms so quick fetches don't flash a bar.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (!isLoading || !visible) return null;

  const isDeterminate = typeof total === "number" && total > 0 && typeof loaded === "number";
  const pct = isDeterminate ? Math.min(100, Math.round((loaded! / total!) * 100)) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-md border border-border bg-muted/40 px-3 py-2 text-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>{label}</span>
        </div>
        {isDeterminate ? (
          <span className="tabular-nums text-xs text-muted-foreground">
            {loaded}/{total} · {pct}%
          </span>
        ) : (
          <span className="tabular-nums text-xs text-muted-foreground">working…</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {isDeterminate ? (
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-primary/70 animate-[slide_1.2s_ease-in-out_infinite]" />
        )}
      </div>
      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
