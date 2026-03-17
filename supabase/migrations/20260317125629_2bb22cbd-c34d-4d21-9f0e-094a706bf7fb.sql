
-- Create the invoice-assets storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-assets', 'invoice-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the esign folder
CREATE POLICY "Authenticated users can upload esign PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-assets' AND (storage.foldername(name))[1] = 'esign');

-- Allow authenticated users to read their org's esign PDFs
CREATE POLICY "Authenticated users can read esign PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoice-assets' AND (storage.foldername(name))[1] = 'esign');

-- Allow authenticated users to overwrite (upsert) esign PDFs
CREATE POLICY "Authenticated users can update esign PDFs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoice-assets' AND (storage.foldername(name))[1] = 'esign');
