-- Allow any authenticated user to insert their own upload history
CREATE POLICY "Users can insert own upload history"
ON public.bulk_upload_history FOR INSERT TO authenticated
WITH CHECK (auth.uid() = uploaded_by);