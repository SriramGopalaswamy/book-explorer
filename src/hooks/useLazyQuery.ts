import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Lazy query hook - only fires when explicitly triggered
 * Use this for data that's not needed immediately on mount
 */
export function useLazyQuery<TData = unknown, TError = unknown>(
  queryKey: unknown[],
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>
) {
  const [enabled, setEnabled] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn,
    enabled,
    ...options,
  });

  const trigger = () => setEnabled(true);

  return {
    ...query,
    trigger,
    isTriggered: enabled,
  };
}
