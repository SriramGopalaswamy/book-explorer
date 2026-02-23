import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmployeeDetails {
  id: string;
  profile_id: string;
  organization_id: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  nationality: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  employee_id_number: string | null;
  pan_number: string | null;
  aadhaar_last_four: string | null;
  uan_number: string | null;
  esi_number: string | null;
}

export type EmployeeDetailsInput = Omit<EmployeeDetails, "id" | "organization_id">;

export function useEmployeeDetails(profileId: string | null) {
  return useQuery({
    queryKey: ["employee-details", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("employee_details")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data as EmployeeDetails | null;
    },
    enabled: !!profileId,
  });
}

export function useUpsertEmployeeDetails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: EmployeeDetailsInput) => {
      const { data, error } = await supabase
        .from("employee_details")
        .upsert(input, { onConflict: "profile_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employee-details", variables.profile_id] });
      toast.success("Employee details saved");
    },
    onError: (err: any) => {
      toast.error("Failed to save: " + err.message);
    },
  });
}
