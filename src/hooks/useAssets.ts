import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Asset {
  id: string;
  organization_id: string | null;
  user_id: string;
  asset_tag: string;
  name: string;
  description: string | null;
  category: string;
  sub_category: string | null;
  serial_number: string | null;
  model_number: string | null;
  manufacturer: string | null;
  barcode: string | null;
  purchase_date: string;
  purchase_price: number;
  vendor_id: string | null;
  bill_id: string | null;
  po_number: string | null;
  location: string | null;
  department: string | null;
  assigned_to: string | null;
  custodian: string | null;
  useful_life_months: number;
  salvage_value: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  current_book_value: number;
  depreciation_start_date: string | null;
  status: string;
  condition: string;
  disposal_date: string | null;
  disposal_price: number | null;
  disposal_method: string | null;
  disposal_notes: string | null;
  warranty_expiry: string | null;
  warranty_provider: string | null;
  insurance_policy: string | null;
  insurance_expiry: string | null;
  last_tagged_date: string | null;
  last_tagged_by: string | null;
  tag_verified: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vendor?: { name: string } | null;
  assigned_profile?: { full_name: string } | null;
}

export interface DepreciationEntry {
  id: string;
  asset_id: string;
  period_date: string;
  depreciation_amount: number;
  accumulated_depreciation: number;
  book_value_after: number;
  is_posted: boolean;
  notes: string | null;
  created_at: string;
}

export type AssetInsert = Omit<Asset, "id" | "created_at" | "updated_at" | "organization_id" | "accumulated_depreciation" | "current_book_value" | "vendor" | "assigned_profile">;

const ASSET_CATEGORIES = [
  "Furniture & Fixtures",
  "IT Equipment",
  "Vehicles",
  "Buildings",
  "Machinery",
  "Office Equipment",
  "Land",
  "Leasehold Improvements",
  "Intangible Assets",
  "Other",
] as const;

const DEPRECIATION_METHODS = [
  { value: "straight_line", label: "Straight Line" },
  { value: "declining_balance", label: "Declining Balance" },
  { value: "double_declining", label: "Double Declining Balance" },
  { value: "sum_of_years", label: "Sum of Years' Digits" },
] as const;

const ASSET_STATUSES = [
  "active",
  "under_maintenance",
  "disposed",
  "written_off",
  "transferred",
] as const;

const ASSET_CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
] as const;

export { ASSET_CATEGORIES, DEPRECIATION_METHODS, ASSET_STATUSES, ASSET_CONDITIONS };

export function useAssets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, vendors!vendor_id(name), profiles!assigned_to(full_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        vendor: a.vendors,
        assigned_profile: a.profiles,
      })) as Asset[];
    },
    enabled: !!user,
  });
}

export function useAssetDepreciation(assetId: string | null) {
  return useQuery({
    queryKey: ["asset_depreciation", assetId],
    queryFn: async () => {
      if (!assetId) return [];
      const { data, error } = await supabase
        .from("asset_depreciation_entries")
        .select("*")
        .eq("asset_id", assetId)
        .order("period_date", { ascending: true });
      if (error) throw error;
      return data as DepreciationEntry[];
    },
    enabled: !!assetId,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (asset: Partial<AssetInsert>) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("assets")
        .insert({ ...asset, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset created successfully");
      supabase.functions.invoke("send-notification-email", {
        body: { type: "asset_registered", payload: { asset_id: data.id } },
      }).catch((err) => console.warn("Failed to send asset notification:", err));
    },
    onError: (error: Error) => {
      toast.error("Failed to create asset: " + error.message);
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<AssetInsert>) => {
      const { data, error } = await supabase
        .from("assets")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset updated successfully");
      if (variables.status === "disposed") {
        supabase.functions.invoke("send-notification-email", {
          body: { type: "asset_disposed", payload: { asset_id: variables.id } },
        }).catch((err) => console.warn("Failed to send disposal notification:", err));
      }
    },
    onError: (error: Error) => {
      toast.error("Failed to update asset: " + error.message);
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete asset: " + error.message);
    },
  });
}

export function useRunDepreciation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      // Fetch the asset
      const { data: asset, error: fetchErr } = await supabase
        .from("assets")
        .select("*")
        .eq("id", assetId)
        .single();
      if (fetchErr || !asset) throw fetchErr || new Error("Asset not found");

      const purchasePrice = Number(asset.purchase_price);
      const salvageValue = Number(asset.salvage_value);
      const usefulLifeMonths = Number(asset.useful_life_months);
      const depreciableAmount = purchasePrice - salvageValue;

      if (depreciableAmount <= 0 || usefulLifeMonths <= 0) {
        throw new Error("Asset is not depreciable (zero depreciable amount or useful life)");
      }

      // Get existing entries count
      const { count } = await supabase
        .from("asset_depreciation_entries")
        .select("*", { count: "exact", head: true })
        .eq("asset_id", assetId);

      const existingMonths = count || 0;
      if (existingMonths >= usefulLifeMonths) {
        throw new Error("Asset is fully depreciated");
      }

      // Calculate next month's depreciation
      let monthlyDep: number;
      const method = asset.depreciation_method;

      if (method === "straight_line") {
        monthlyDep = depreciableAmount / usefulLifeMonths;
      } else if (method === "declining_balance") {
        const rate = 1 / (usefulLifeMonths / 12);
        const currentBV = Number(asset.current_book_value);
        monthlyDep = (currentBV * rate) / 12;
      } else if (method === "double_declining") {
        const rate = 2 / (usefulLifeMonths / 12);
        const currentBV = Number(asset.current_book_value);
        monthlyDep = (currentBV * rate) / 12;
      } else {
        // sum_of_years
        const yearsTotal = usefulLifeMonths / 12;
        const sumOfYears = (yearsTotal * (yearsTotal + 1)) / 2;
        const currentYear = Math.floor(existingMonths / 12) + 1;
        const remainingYears = yearsTotal - currentYear + 1;
        monthlyDep = (depreciableAmount * remainingYears) / sumOfYears / 12;
      }

      // Don't depreciate below salvage value
      const newAccum = Number(asset.accumulated_depreciation) + monthlyDep;
      if (newAccum > depreciableAmount) {
        monthlyDep = depreciableAmount - Number(asset.accumulated_depreciation);
      }

      monthlyDep = Math.round(monthlyDep * 100) / 100;
      const accumAfter = Math.round((Number(asset.accumulated_depreciation) + monthlyDep) * 100) / 100;
      const bvAfter = Math.round((purchasePrice - accumAfter) * 100) / 100;

      // Determine period date
      const startDate = new Date(asset.depreciation_start_date || asset.purchase_date);
      const periodDate = new Date(startDate);
      periodDate.setMonth(periodDate.getMonth() + existingMonths);
      const periodStr = periodDate.toISOString().split("T")[0];

      // Insert depreciation entry
      const { error: insertErr } = await supabase
        .from("asset_depreciation_entries")
        .insert({
          asset_id: assetId,
          period_date: periodStr,
          depreciation_amount: monthlyDep,
          accumulated_depreciation: accumAfter,
          book_value_after: bvAfter,
        } as any);
      if (insertErr) throw insertErr;

      // Update asset
      const { error: updateErr } = await supabase
        .from("assets")
        .update({
          accumulated_depreciation: accumAfter,
          current_book_value: bvAfter,
        } as any)
        .eq("id", assetId);
      if (updateErr) throw updateErr;

      // Post to GL
      const { error: glErr } = await supabase
        .from("financial_records")
        .insert([
          {
            user_id: asset.user_id,
            organization_id: asset.organization_id,
            type: "expense",
            category: "Depreciation Expense",
            amount: monthlyDep,
            debit: monthlyDep,
            credit: 0,
            reference_id: assetId,
            reference_type: "depreciation",
            record_date: periodStr,
            posting_date: periodStr,
            description: `Depreciation: ${asset.name} (${asset.asset_tag}) - ${periodStr}`,
            is_posted: true,
            posted_at: new Date().toISOString(),
          },
          {
            user_id: asset.user_id,
            organization_id: asset.organization_id,
            type: "asset",
            category: "Accumulated Depreciation",
            amount: monthlyDep,
            debit: 0,
            credit: monthlyDep,
            reference_id: assetId,
            reference_type: "depreciation",
            record_date: periodStr,
            posting_date: periodStr,
            description: `Accum. Depr.: ${asset.name} (${asset.asset_tag}) - ${periodStr}`,
            is_posted: true,
            posted_at: new Date().toISOString(),
          },
        ]);
      if (glErr) throw glErr;

      return { monthlyDep, accumAfter, bvAfter };
    },
    onSuccess: (data, assetId) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset_depreciation"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      toast.success(`Depreciation of ₹${data.monthlyDep.toLocaleString()} recorded`);
      supabase.functions.invoke("send-notification-email", {
        body: { type: "asset_depreciation_posted", payload: { asset_id: assetId, amount: data.monthlyDep, book_value: data.bvAfter } },
      }).catch((err) => console.warn("Failed to send depreciation notification:", err));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
