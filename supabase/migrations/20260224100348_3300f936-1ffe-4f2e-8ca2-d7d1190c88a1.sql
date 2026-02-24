
-- Allow managers to view and update pending memos from their direct reports
CREATE POLICY "Managers can view direct reports pending memos"
  ON public.memos FOR SELECT
  USING (
    status = 'pending_approval'
    AND EXISTS (
      SELECT 1 FROM profiles author
      JOIN profiles mgr ON mgr.id = author.manager_id
      WHERE author.user_id = memos.user_id
        AND mgr.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can update direct reports pending memos"
  ON public.memos FOR UPDATE
  USING (
    status = 'pending_approval'
    AND EXISTS (
      SELECT 1 FROM profiles author
      JOIN profiles mgr ON mgr.id = author.manager_id
      WHERE author.user_id = memos.user_id
        AND mgr.user_id = auth.uid()
    )
  );
