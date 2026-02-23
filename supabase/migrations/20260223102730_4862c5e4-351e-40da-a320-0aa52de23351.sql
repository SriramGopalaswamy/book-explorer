
-- Create leave_types table for HR-configurable leave types
CREATE TABLE public.leave_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  key text NOT NULL,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'Briefcase',
  color text NOT NULL DEFAULT 'text-blue-600',
  default_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leave_types_org_key_unique UNIQUE (organization_id, key),
  CONSTRAINT fk_leave_types_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Enable RLS
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

-- All org members can view active leave types
CREATE POLICY "Org members can view leave types"
ON public.leave_types
FOR SELECT
USING (check_org_access(auth.uid(), organization_id));

-- HR and Admin can manage leave types
CREATE POLICY "HR and Admin can manage leave types"
ON public.leave_types
FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

-- Seed default leave types for the default org
INSERT INTO public.leave_types (organization_id, key, label, icon, color, default_days, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'casual', 'Casual Leave', 'Palmtree', 'text-green-600', 12, 1),
  ('00000000-0000-0000-0000-000000000001', 'sick', 'Sick Leave', 'Stethoscope', 'text-red-600', 10, 2),
  ('00000000-0000-0000-0000-000000000001', 'earned', 'Earned Leave', 'Briefcase', 'text-blue-600', 15, 3),
  ('00000000-0000-0000-0000-000000000001', 'maternity', 'Maternity Leave', 'Baby', 'text-purple-600', 180, 4),
  ('00000000-0000-0000-0000-000000000001', 'paternity', 'Paternity Leave', 'Baby', 'text-purple-600', 15, 5),
  ('00000000-0000-0000-0000-000000000001', 'wfh', 'Work From Home', 'Home', 'text-orange-600', 30, 6);
