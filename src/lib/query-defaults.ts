/**
 * Named React Query profiles for consistent caching strategy across hooks.
 *
 * Usage:
 *   useQuery({ queryKey: [...], queryFn: ..., ...QUERY_PROFILES.MASTER_DATA })
 *
 * The global default in App.tsx applies to anything that doesn't opt in.
 */

export const QUERY_PROFILES = {
  /**
   * Master / rarely-changing data (leave types, CTC components, chart of
   * accounts, tax rates, holidays, departments, designations, warehouses,
   * currencies, items, customers, vendors).
   *
   * Stale for 10 minutes — refetch on demand via invalidateQueries after
   * mutations.
   */
  MASTER_DATA: {
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  /**
   * Roles, permissions and module access. Security-sensitive but not
   * volatile — admins change these rarely. 5min keeps revocations
   * propagating reasonably fast.
   */
  ROLES_PERMS: {
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  /**
   * Default transactional data (invoices, bills, payments, attendance,
   * journal entries). Short stale window so users see fresh data after
   * peers post entries.
   */
  TRANSACTIONAL: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },

  /**
   * Real-time / dashboard widgets that should always show recent data.
   */
  REALTIME: {
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
} as const;

export type QueryProfileName = keyof typeof QUERY_PROFILES;
