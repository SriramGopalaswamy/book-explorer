
-- Create employee_details table for extended profile information (HR-only)
CREATE TABLE public.employee_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id),
  
  -- Personal
  date_of_birth DATE,
  gender TEXT,
  blood_group TEXT,
  marital_status TEXT,
  nationality TEXT DEFAULT 'Indian',
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',
  
  -- Emergency Contact
  emergency_contact_name TEXT,
  emergency_contact_relation TEXT,
  emergency_contact_phone TEXT,
  
  -- Bank Details
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  
  -- Employment extras
  employee_id_number TEXT,
  pan_number TEXT,
  aadhaar_last_four TEXT,
  uan_number TEXT,
  esi_number TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_details ENABLE ROW LEVEL SECURITY;

-- HR/Admin can fully manage employee details
CREATE POLICY "HR admins can manage employee details"
  ON public.employee_details
  FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

-- Employees can view their own details (read-only)
CREATE POLICY "Employees can view own details"
  ON public.employee_details
  FOR SELECT
  USING (
    profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

-- Auto-set organization_id on insert
CREATE OR REPLACE FUNCTION public.set_employee_details_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.organization_id := (SELECT organization_id FROM profiles WHERE id = NEW.profile_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_set_employee_details_org
  BEFORE INSERT ON public.employee_details
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_details_org_id();

-- Auto-update updated_at
CREATE TRIGGER update_employee_details_updated_at
  BEFORE UPDATE ON public.employee_details
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
