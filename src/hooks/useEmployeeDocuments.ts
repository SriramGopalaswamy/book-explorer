import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface EmployeeDocument {
  id: string;
  profile_id: string;
  organization_id: string;
  document_type: string;
  document_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const DOC_TYPES = [
  "Offer Letter",
  "Appraisal Letter",
  "Promotion Letter",
  "Experience Letter",
  "Relieving Letter",
  "Salary Slip",
  "Form 16",
  "ID Proof",
  "Address Proof",
  "Other",
] as const;

export { DOC_TYPES };

export function useEmployeeDocuments(profileId: string | null) {
  return useQuery({
    queryKey: ["employee-documents", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("employee_documents")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeDocument[];
    },
    enabled: !!profileId,
  });
}

export function useUploadEmployeeDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      profileId,
      file,
      documentType,
      documentName,
      notes,
    }: {
      profileId: string;
      file: File;
      documentType: string;
      documentName: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const filePath = `${profileId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("employee_documents")
        .insert({
          profile_id: profileId,
          organization_id: orgId,
          document_type: documentType,
          document_name: documentName,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: user.id,
          notes: notes || null,
        });
      if (dbError) throw dbError;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employee-documents", variables.profileId] });
      toast.success("Document uploaded successfully");
    },
    onError: (err: any) => {
      toast.error("Upload failed: " + err.message);
    },
  });
}

export function useDeleteEmployeeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, filePath, profileId }: { id: string; filePath: string; profileId: string }) => {
      await supabase.storage.from("employee-documents").remove([filePath]);
      const { error } = await supabase.from("employee_documents").delete().eq("id", id);
      if (error) throw error;
      return profileId;
    },
    onSuccess: (profileId) => {
      queryClient.invalidateQueries({ queryKey: ["employee-documents", profileId] });
      toast.success("Document deleted");
    },
    onError: (err: any) => {
      toast.error("Delete failed: " + err.message);
    },
  });
}
