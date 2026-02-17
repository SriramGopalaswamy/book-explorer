
-- Drop the FK constraint so employee profiles can exist without auth accounts
ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_fkey;
