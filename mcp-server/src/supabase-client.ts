/**
 * Supabase client for MCP server — uses service role key for full access.
 * All queries are still scoped by organization_id for multi-tenant safety.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
        "Copy .env.example to .env and fill in your Supabase credentials."
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

/** Resolve org id — prefer explicit arg, then env default */
export function resolveOrgId(orgId?: string): string | undefined {
  return orgId ?? process.env.DEFAULT_ORGANIZATION_ID ?? undefined;
}

/** Simple structured logger */
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "error", msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "warn", msg, ...meta })),
};

/** Wrap a Supabase call and throw a readable error on failure */
export async function query<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>
): Promise<T> {
  const { data, error } = await fn();
  if (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : JSON.stringify(error);
    throw new Error(`Database error: ${msg}`);
  }
  return data as T;
}
