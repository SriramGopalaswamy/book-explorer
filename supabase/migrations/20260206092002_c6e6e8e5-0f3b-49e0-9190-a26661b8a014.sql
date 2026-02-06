-- =====================================================
-- ATTENDANCE RECORDS TABLE
-- =====================================================
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMP WITH TIME ZONE,
  check_out TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave', 'half_day')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Admins/HR can view all attendance
CREATE POLICY "Admins and HR can view all attendance"
  ON public.attendance_records FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

-- Admins/HR can insert attendance
CREATE POLICY "Admins and HR can insert attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (is_admin_or_hr(auth.uid()));

-- Admins/HR can update attendance
CREATE POLICY "Admins and HR can update attendance"
  ON public.attendance_records FOR UPDATE
  USING (is_admin_or_hr(auth.uid()));

-- Admins/HR can delete attendance
CREATE POLICY "Admins and HR can delete attendance"
  ON public.attendance_records FOR DELETE
  USING (is_admin_or_hr(auth.uid()));

-- Users can view their own attendance
CREATE POLICY "Users can view own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================
-- LEAVE BALANCES TABLE
-- =====================================================
CREATE TABLE public.leave_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh')),
  total_days INTEGER NOT NULL DEFAULT 0,
  used_days INTEGER NOT NULL DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (profile_id, leave_type, year)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- Admins/HR can manage all leave balances
CREATE POLICY "Admins and HR can view all leave balances"
  ON public.leave_balances FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can insert leave balances"
  ON public.leave_balances FOR INSERT
  WITH CHECK (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (is_admin_or_hr(auth.uid()));

-- Users can view their own balances
CREATE POLICY "Users can view own leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================
-- LEAVE REQUESTS TABLE
-- =====================================================
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh')),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Admins/HR can manage all leave requests
CREATE POLICY "Admins and HR can view all leave requests"
  ON public.leave_requests FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (is_admin_or_hr(auth.uid()));

-- Users can view and create their own requests
CREATE POLICY "Users can view own leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending leave requests"
  ON public.leave_requests FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

-- =====================================================
-- GOALS TABLE
-- =====================================================
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'delayed', 'completed')),
  category TEXT NOT NULL DEFAULT 'general',
  owner TEXT,
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Users can manage their own goals
CREATE POLICY "Users can view own goals"
  ON public.goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own goals"
  ON public.goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON public.goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.goals FOR DELETE
  USING (auth.uid() = user_id);

-- Admins/HR can view all goals
CREATE POLICY "Admins and HR can view all goals"
  ON public.goals FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

-- =====================================================
-- MEMOS TABLE
-- =====================================================
CREATE TABLE public.memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  excerpt TEXT,
  department TEXT NOT NULL DEFAULT 'All',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published')),
  views INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

-- Published memos can be viewed by all authenticated users
CREATE POLICY "Authenticated users can view published memos"
  ON public.memos FOR SELECT
  TO authenticated
  USING (status = 'published');

-- Users can view their own memos (drafts, pending)
CREATE POLICY "Users can view own memos"
  ON public.memos FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own memos
CREATE POLICY "Users can create own memos"
  ON public.memos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own memos
CREATE POLICY "Users can update own memos"
  ON public.memos FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own memos
CREATE POLICY "Users can delete own memos"
  ON public.memos FOR DELETE
  USING (auth.uid() = user_id);

-- Admins/HR can manage all memos
CREATE POLICY "Admins and HR can manage all memos"
  ON public.memos FOR ALL
  USING (is_admin_or_hr(auth.uid()));

-- =====================================================
-- HOLIDAYS TABLE (for company holidays)
-- =====================================================
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view holidays
CREATE POLICY "Authenticated users can view holidays"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage holidays
CREATE POLICY "Admins can manage holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- =====================================================
-- TRIGGERS FOR updated_at
-- =====================================================
CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memos_updated_at
  BEFORE UPDATE ON public.memos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();