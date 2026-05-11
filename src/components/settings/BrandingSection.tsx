/**
 * GBC-21 + GBC-20: extracted Settings → Branding section.
 *
 * Field/handler inventory (per CLAUDE.md regression-prevention protocol):
 *
 *   Inputs:
 *     - Company Logo (file upload, image/png|jpeg|svg+xml|webp)
 *     - Short Logo / Favicon (file upload, image/png|jpeg|webp)
 *     - Brand Color (color picker + hex text input)
 *     - Authorized Signatory Name (text input)
 *
 *   Actions:
 *     - handleUpload(type, file)   — uploads to tenant-branding bucket, upserts
 *                                    organization_settings.{logo_url|favicon_url}.
 *     - handleRemove(type)         — nulls the URL column.
 *     - handleSaveBranding()       — upserts brand_color + authorized_signatory_name
 *                                    via useOnboardingCompliance().upsert.
 *
 *   Data sources:
 *     - useOnboardingCompliance() — brand_color, authorized_signatory_name.
 *     - useOrgBranding()          — organization_id, logo_url, favicon_url.
 *
 *   Notable invariants preserved:
 *     - File-input refs trigger via Button onClick (not native click()).
 *     - Logo URL gets a cache-buster ("?v=" + Date.now()) so the browser
 *       doesn't show the stale image after re-upload.
 *     - upsert uses onConflict='organization_id'.
 *     - GBC-22: branding data fetched via useOrgBranding hook, not inline
 *       useEffect + supabase.from.
 *
 * brand_color + signatory_name use react-hook-form + zod. Logo / favicon
 * stay as imperative file inputs (the upload flow is too imperative for
 * a form abstraction; preserving the existing UX).
 */

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Image, Palette, Upload, X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingCompliance } from "@/hooks/useOnboardingCompliance";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { toast } from "sonner";

const brandingSchema = z.object({
  brand_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Brand color must be a 6-digit hex like #d6336c"),
  authorized_signatory_name: z.string().trim().max(200).optional().or(z.literal("")),
});

type BrandingForm = z.infer<typeof brandingSchema>;

export default function BrandingSection() {
  const { user } = useAuth();
  const { compliance, upsert } = useOnboardingCompliance();
  const { data: branding } = useOrgBranding();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // GBC-22: mirror useOrgBranding query result into local preview state.
  useEffect(() => {
    if (!branding) return;
    setOrgId(branding.organization_id);
    setLogoUrl(branding.logo_url);
    setFaviconUrl(branding.favicon_url);
  }, [branding]);

  // RHF for brand_color + signatory only.
  const form = useForm<BrandingForm>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      brand_color: "#d6336c",
      authorized_signatory_name: "",
    },
    mode: "onBlur",
  });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting, isDirty } } = form;

  // Seed from compliance once it loads.
  useEffect(() => {
    if (compliance) {
      reset({
        brand_color: compliance.brand_color || "#d6336c",
        authorized_signatory_name: compliance.authorized_signatory_name || "",
      });
    }
  }, [compliance, reset]);

  const brandColor = watch("brand_color");

  async function handleUpload(type: "logo" | "favicon", file: File) {
    if (!orgId || !user) return;
    setUploading(type);
    try {
      const ext = file.name.split(".").pop();
      const path = `${orgId}/${type}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("tenant-branding")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("tenant-branding")
        .getPublicUrl(path);
      const url = publicData.publicUrl + "?v=" + Date.now();

      const { error: dbError } = await supabase
        .from("organization_settings")
        .upsert(
          {
            organization_id: orgId,
            [type === "logo" ? "logo_url" : "favicon_url"]: url,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "organization_id" },
        );
      if (dbError) throw dbError;

      if (type === "logo") setLogoUrl(url);
      else setFaviconUrl(url);
      toast.success(`${type === "logo" ? "Logo" : "Favicon"} updated successfully`);
    } catch (err: any) {
      toast.error(`Failed to upload: ${err.message}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleRemove(type: "logo" | "favicon") {
    if (!orgId) return;
    await supabase
      .from("organization_settings")
      .update({
        [type === "logo" ? "logo_url" : "favicon_url"]: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("organization_id", orgId);
    if (type === "logo") setLogoUrl(null);
    else setFaviconUrl(null);
    toast.success(`${type === "logo" ? "Logo" : "Favicon"} removed`);
  }

  const onSubmit = async (values: BrandingForm) => {
    try {
      await upsert.mutateAsync({
        brand_color: values.brand_color,
        authorized_signatory_name: values.authorized_signatory_name || null,
      });
      toast.success("Branding settings saved");
      reset(values);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Logo & Favicon
          </CardTitle>
          <CardDescription>
            Upload your company logo and favicon. These appear on invoices, documents, and the browser tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Company Logo</Label>
              <p className="text-xs text-muted-foreground">Used on invoices, quotes, payslips, and the sidebar. Recommended: 400×100px PNG/SVG.</p>
              <div className="flex items-center gap-4">
                <div className="h-20 w-40 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" disabled={uploading === "logo"} onClick={() => logoInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading === "logo" ? "Uploading…" : "Upload"}
                  </Button>
                  {logoUrl && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove("logo")}>
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload("logo", f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Short Logo / Favicon</Label>
              <p className="text-xs text-muted-foreground">Used as browser favicon and in compact UI areas. Recommended: 512×512px square PNG.</p>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="Favicon" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center">No icon</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" disabled={uploading === "favicon"} onClick={() => faviconInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading === "favicon" ? "Uploading…" : "Upload"}
                  </Button>
                  {faviconUrl && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove("favicon")}>
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload("favicon", f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Brand Identity
          </CardTitle>
          <CardDescription>
            Customize your brand color and authorized signatory for official documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Brand Color</Label>
                <p className="text-xs text-muted-foreground">Used on invoices, quotes, and document headers.</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setValue("brand_color", e.target.value, { shouldDirty: true })}
                    className="h-9 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    placeholder="#d6336c"
                    className="flex-1"
                    {...register("brand_color")}
                  />
                </div>
                {errors.brand_color && (
                  <p className="text-xs text-destructive">{errors.brand_color.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Authorized Signatory Name</Label>
                <p className="text-xs text-muted-foreground">Printed on official documents.</p>
                <Input
                  placeholder="Name on official documents"
                  {...register("authorized_signatory_name")}
                />
                {errors.authorized_signatory_name && (
                  <p className="text-xs text-destructive">{errors.authorized_signatory_name.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
