
-- Fix: Manager memo update policy fails because after updating status
-- to 'published' or 'rejected', the row no longer matches the USING clause
-- (which requires status = 'pending_approval'). We need a WITH CHECK that
-- allows the new status values.

DROP POLICY IF EXISTS "Managers can update direct reports pending memos" ON public.memos;

CREATE POLICY "Managers can update direct reports pending memos"
  ON public.memos FOR UPDATE
  USING (
    status = 'pending_approval'
    AND EXISTS (
      SELECT 1
      FROM profiles author
      JOIN profiles mgr ON mgr.id = author.manager_id
      WHERE author.user_id = memos.user_id
        AND mgr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('published', 'rejected')
    AND EXISTS (
      SELECT 1
      FROM profiles author
      JOIN profiles mgr ON mgr.id = author.manager_id
      WHERE author.user_id = memos.user_id
        AND mgr.user_id = auth.uid()
    )
  );
