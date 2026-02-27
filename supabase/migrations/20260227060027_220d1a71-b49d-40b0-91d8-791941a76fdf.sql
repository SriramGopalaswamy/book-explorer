
-- Master CTC component templates (org-level, managed by Finance)
CREATE TABLE public.master_ctc_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL DEFAULT 'earning' CHECK (component_type IN ('earning', 'deduction')),
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  default_percentage_of_basic NUMERIC DEFAULT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, component_name)
);

ALTER TABLE public.master_ctc_components ENABLE ROW LEVEL SECURITY;

-- Finance and Admin can read
CREATE POLICY "org_members_can_read_master_ctc"
ON public.master_ctc_components FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

-- Only finance can insert/update/delete
CREATE POLICY "finance_can_manage_master_ctc"
ON public.master_ctc_components FOR ALL TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));
