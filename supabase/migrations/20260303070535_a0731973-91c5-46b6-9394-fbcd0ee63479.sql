-- Allow managers to update attendance_records for their direct reports (for correction approvals)
CREATE POLICY "Managers can update direct reports attendance"
  ON public.attendance_records
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id()
    )
  );

-- Allow managers to insert attendance_records for direct reports (when no record exists for that date)
CREATE POLICY "Managers can insert direct reports attendance"
  ON public.attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id()
    )
  );

-- Allow managers to update attendance_daily for their direct reports (for correction approvals)
CREATE POLICY "Managers can update direct reports attendance daily"
  ON public.attendance_daily
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id()
    )
  );
