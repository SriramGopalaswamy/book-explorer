
-- Add manager_id to profiles for org chart hierarchy
ALTER TABLE public.profiles
ADD COLUMN manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for efficient tree queries
CREATE INDEX idx_profiles_manager_id ON public.profiles(manager_id);
