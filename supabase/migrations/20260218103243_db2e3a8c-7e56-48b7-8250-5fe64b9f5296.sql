-- Create attendance correction requests table
CREATE TABLE public.attendance_correction_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id),
  date date NOT NULL,
  requested_check_in text NULL,
  requested_check_out text NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid NULL,
  reviewed_at timestamp with time zone NULL,
  reviewer_notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Enable RLS
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;

-- Employees can insert their own correction requests
CREATE POLICY "Users can create own correction requests"
  ON public.attendance_correction_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Employees can view their own correction requests
CREATE POLICY "Users can view own correction requests"
  ON public.attendance_correction_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Managers, HR, and Admins can view all correction requests
CREATE POLICY "Managers HR Admins can view all correction requests"
  ON public.attendance_correction_requests
  FOR SELECT
  USING (is_admin_hr_or_manager(auth.uid()));

-- Managers, HR, and Admins can update (approve/reject) correction requests
CREATE POLICY "Managers HR Admins can update correction requests"
  ON public.attendance_correction_requests
  FOR UPDATE
  USING (is_admin_hr_or_manager(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_attendance_correction_requests_updated_at
  BEFORE UPDATE ON public.attendance_correction_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();