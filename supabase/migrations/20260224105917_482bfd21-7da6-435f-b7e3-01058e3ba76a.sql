
-- Form 16 records table for annual tax certificate storage
CREATE TABLE IF NOT EXISTS public.form16_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL,
  total_salary NUMERIC NOT NULL DEFAULT 0,
  total_tds NUMERIC NOT NULL DEFAULT 0,
  form16_pdf_url TEXT,
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id),
  employer_tan TEXT,
  employer_pan TEXT,
  employee_pan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, organization_id, financial_year)
);

-- Enable RLS
ALTER TABLE public.form16_records ENABLE ROW LEVEL SECURITY;

-- RLS: Org members can view their own Form 16
CREATE POLICY "Users can view own form16"
  ON public.form16_records FOR SELECT
  USING (
    profile_id = public.get_current_user_profile_id()
    AND public.is_org_member(auth.uid(), organization_id)
  );

-- RLS: Admin/HR/Finance can view all in org
CREATE POLICY "Admin/HR/Finance can view all form16"
  ON public.form16_records FOR SELECT
  USING (
    public.is_org_admin_or_hr(auth.uid(), organization_id)
    OR public.is_org_admin_or_finance(auth.uid(), organization_id)
  );

-- RLS: Admin/Finance can insert
CREATE POLICY "Admin/Finance can insert form16"
  ON public.form16_records FOR INSERT
  WITH CHECK (
    public.is_org_admin_or_finance(auth.uid(), organization_id)
  );

-- RLS: Admin/Finance can update
CREATE POLICY "Admin/Finance can update form16"
  ON public.form16_records FOR UPDATE
  USING (
    public.is_org_admin_or_finance(auth.uid(), organization_id)
  );

-- Add reviewed_by and reviewed_at to investment_declarations if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_declarations' AND column_name = 'reviewed_by') THEN
    ALTER TABLE public.investment_declarations ADD COLUMN reviewed_by UUID REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_declarations' AND column_name = 'reviewed_at') THEN
    ALTER TABLE public.investment_declarations ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;
END $$;
