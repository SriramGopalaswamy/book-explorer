-- Item 17: Allow the job creator to update status/progress on their own jobs.
--
-- The INSERT policy (from 20260428210000) already lets org members create jobs.
-- This policy lets the same user drive the job through its lifecycle from the
-- browser (running → completed / failed) so onUpload progress is tracked without
-- a server-side processor.
--
-- USING  : existing row must belong to the caller (created_by = auth.uid())
-- WITH CHECK: new row must still belong to the caller and have a non-pending status

DROP POLICY IF EXISTS "Job creator can update own job progress" ON public.job_queue;
CREATE POLICY "Job creator can update own job progress"
  ON public.job_queue FOR UPDATE
  TO authenticated
  USING  (created_by = auth.uid())
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('running', 'completed', 'failed', 'cancelled')
  );
