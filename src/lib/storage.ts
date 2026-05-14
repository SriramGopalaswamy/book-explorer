/**
 * Cross-tenant safe storage helpers (GBC-17).
 *
 * Buckets are private and gated by RLS that decodes the *first* path segment as
 * an organisation UUID. To remain compatible:
 *  - Always upload under `{org_id}/{subfolder}/{filename}`.
 *  - Always read via short-lived signed URLs — never `getPublicUrl()`.
 */
import { supabase } from "@/integrations/supabase/client";

export const ORG_SCOPED_BUCKETS = [
  "memo-attachments",
  "bill-attachments",
  "credit-card-statements",
  "invoice-assets",
  "employee-documents",
  "payslips",
] as const;

export type OrgScopedBucket = (typeof ORG_SCOPED_BUCKETS)[number];

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not create signed URL for ${bucket}/${path}: ${error?.message ?? "unknown error"}`,
    );
  }
  return data.signedUrl;
}

/** Compose an org-scoped storage path: `{orgId}/{subfolder}/{filename}`. */
export function orgScopedPath(orgId: string, subfolder: string, filename: string): string {
  if (!orgId) throw new Error("orgScopedPath requires a non-empty orgId");
  const sub = subfolder.replace(/^\/+|\/+$/g, "");
  const file = filename.replace(/^\/+/, "");
  return sub ? `${orgId}/${sub}/${file}` : `${orgId}/${file}`;
}
