import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Save, Upload, Building2, CreditCard, FileSignature, Settings2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface InvoiceSettingsData {
  company_name: string;
  cin: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  signature_url: string;
  msme_number: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_type: string;
  branch: string;
  ifsc_code: string;
  upi_code: string;
  custom_footer_text: string;
}

const defaultSettings: InvoiceSettingsData = {
  company_name: "GRX10 SOLUTIONS PRIVATE LIMITED",
  cin: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  gstin: "",
  phone: "",
  email: "",
  website: "",
  logo_url: "",
  signature_url: "",
  msme_number: "",
  bank_name: "",
  account_name: "",
  account_number: "",
  account_type: "Current Account",
  branch: "",
  ifsc_code: "",
  upi_code: "",
  custom_footer_text: "",
};

export default function InvoiceSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const [form, setForm] = useState<InvoiceSettingsData>(defaultSettings);
  const [uploading, setUploading] = useState<"logo" | "signature" | null>(null);

  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ["invoice-settings", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("invoice_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (existingSettings) {
      setForm({
        company_name: existingSettings.company_name || defaultSettings.company_name,
        cin: existingSettings.cin || "",
        address_line1: existingSettings.address_line1 || "",
        address_line2: existingSettings.address_line2 || "",
        city: existingSettings.city || "",
        state: existingSettings.state || "",
        pincode: existingSettings.pincode || "",
        country: existingSettings.country || "India",
        gstin: existingSettings.gstin || "",
        phone: existingSettings.phone || "",
        email: existingSettings.email || "",
        website: existingSettings.website || "",
        logo_url: existingSettings.logo_url || "",
        signature_url: existingSettings.signature_url || "",
        msme_number: existingSettings.msme_number || "",
        bank_name: existingSettings.bank_name || "",
        account_name: existingSettings.account_name || "",
        account_number: existingSettings.account_number || "",
        account_type: existingSettings.account_type || "Current Account",
        branch: existingSettings.branch || "",
        ifsc_code: existingSettings.ifsc_code || "",
        upi_code: existingSettings.upi_code || "",
        custom_footer_text: existingSettings.custom_footer_text || "",
      });
    }
  }, [existingSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      if (existingSettings) {
        const { error } = await supabase
          .from("invoice_settings")
          .update({ ...form })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("invoice_settings")
          .insert({ ...form, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
      toast({ title: "Settings Saved", description: "Invoice settings have been updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (file: File, type: "logo" | "signature") => {
    if (!user) return;
    setUploading(type);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${type}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("invoice-assets")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("invoice-assets")
        .getPublicUrl(path);

      setForm(prev => ({
        ...prev,
        [type === "logo" ? "logo_url" : "signature_url"]: publicUrl,
      }));

      toast({ title: `${type === "logo" ? "Logo" : "Signature"} uploaded` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const setField = (field: keyof InvoiceSettingsData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (isCheckingRole) {
    return (
      <MainLayout title="Invoice Settings">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Skeleton className="h-8 w-48" />
        </div>
      </MainLayout>
    );
  }

  if (!hasFinanceAccess) {
    return (
      <AccessDenied
        message="Finance Access Required"
        description="Only Finance and Admin roles can manage invoice settings."
      />
    );
  }

  if (isLoading) {
    return (
      <MainLayout title="Invoice Settings">
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Invoice Settings"
      subtitle="Configure company details, logos, and bank information for your invoices"
    >
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/financial/invoicing")}>
          <ArrowLeft className="h-4 w-4" /> Back to Invoicing
        </Button>
        {/* Company Information + Logo & Signature side by side */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-6">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Company Information
            </CardTitle>
            <CardDescription>Details that appear on your invoices</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Company Name</Label><Input value={form.company_name} onChange={e => setField("company_name", e.target.value)} /></div>
              <div><Label>CIN</Label><Input placeholder="e.g. U62090KA2023PTC179748" value={form.cin} onChange={e => setField("cin", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Address Line 1</Label><Input value={form.address_line1} onChange={e => setField("address_line1", e.target.value)} /></div>
              <div><Label>Address Line 2</Label><Input value={form.address_line2} onChange={e => setField("address_line2", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-4 gap-4">
              <div><Label>City</Label><Input value={form.city} onChange={e => setField("city", e.target.value)} /></div>
              <div><Label>State</Label><Input value={form.state} onChange={e => setField("state", e.target.value)} /></div>
              <div><Label>Pincode</Label><Input value={form.pincode} onChange={e => setField("pincode", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={e => setField("country", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>GSTIN</Label><Input placeholder="e.g. 29AAKCG7787M1ZH" value={form.gstin} onChange={e => setField("gstin", e.target.value)} /></div>
              <div><Label>MSME / Udyam Number</Label><Input placeholder="e.g. UDYAM-KR-03-0372097" value={form.msme_number} onChange={e => setField("msme_number", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setField("phone", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={e => setField("website", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Logo & Signature */}
        <Card className="lg:w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              Logo & Signature
            </CardTitle>
            <CardDescription>Upload your company logo and authorized signature</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Company Logo</Label>
              {form.logo_url && (
                <div className="border rounded-lg p-3 bg-secondary/30">
                  <img src={form.logo_url} alt="Logo" className="h-16 object-contain" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  id="logo-upload"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "logo");
                  }}
                />
                <Button variant="outline" size="sm" asChild disabled={uploading === "logo"}>
                  <label htmlFor="logo-upload" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading === "logo" ? "Uploading..." : "Upload Logo"}
                  </label>
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Authorized Signature</Label>
              {form.signature_url && (
                <div className="border rounded-lg p-3 bg-secondary/30">
                  <img src={form.signature_url} alt="Signature" className="h-16 object-contain" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  id="sig-upload"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "signature");
                  }}
                />
                <Button variant="outline" size="sm" asChild disabled={uploading === "signature"}>
                  <label htmlFor="sig-upload" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading === "signature" ? "Uploading..." : "Upload Signature"}
                  </label>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Bank Details
            </CardTitle>
            <CardDescription>Bank information that appears on invoices for payment</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Account Name</Label><Input value={form.account_name} onChange={e => setField("account_name", e.target.value)} /></div>
              <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setField("bank_name", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Account Type</Label><Input value={form.account_type} onChange={e => setField("account_type", e.target.value)} /></div>
              <div><Label>Account Number</Label><Input value={form.account_number} onChange={e => setField("account_number", e.target.value)} /></div>
              <div><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={e => setField("ifsc_code", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Branch</Label><Input value={form.branch} onChange={e => setField("branch", e.target.value)} /></div>
              <div><Label>UPI Code</Label><Input value={form.upi_code} onChange={e => setField("upi_code", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Text */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Custom Footer Text
            </CardTitle>
            <CardDescription>Optional text that appears at the bottom of every invoice</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g. Thank you for your business! Payment terms apply."
              value={form.custom_footer_text}
              onChange={e => setField("custom_footer_text", e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-gradient-financial text-white hover:opacity-90"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
