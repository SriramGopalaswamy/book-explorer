-- Table to persist biometric employee code → profile ID mappings
CREATE TABLE IF NOT EXISTS public.employee_code_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_code text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_device text DEFAULT 'biometric',
  employee_name_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_code)
);

ALTER TABLE public.employee_code_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view mappings"
  ON public.employee_code_mappings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert mappings"
  ON public.employee_code_mappings FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update mappings"
  ON public.employee_code_mappings FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org members can delete mappings"
  ON public.employee_code_mappings FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE INDEX idx_ecm_org ON public.employee_code_mappings(organization_id);
CREATE INDEX idx_ecm_code ON public.employee_code_mappings(organization_id, employee_code);
