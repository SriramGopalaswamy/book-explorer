-- Fix FK constraints on vendors to allow deletion

-- assets.vendor_id → SET NULL on delete
ALTER TABLE public.assets DROP CONSTRAINT assets_vendor_id_fkey;
ALTER TABLE public.assets ADD CONSTRAINT assets_vendor_id_fkey 
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

-- ai_vendor_profiles → CASCADE on delete (profile is meaningless without vendor)
ALTER TABLE public.ai_vendor_profiles DROP CONSTRAINT ai_vendor_profiles_vendor_id_fkey;
ALTER TABLE public.ai_vendor_profiles ADD CONSTRAINT ai_vendor_profiles_vendor_id_fkey 
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;