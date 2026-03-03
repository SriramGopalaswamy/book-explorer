-- Drop the old duplicate overload of post_journal_entry that has different parameter order
-- and lacks control account enforcement. Keep only the newer version.
DROP FUNCTION IF EXISTS public.post_journal_entry(uuid, text, uuid, date, text, jsonb);