-- ══════════════════════════════════════════════════════════════════════
-- GBC-52 — workflow_drafts table for the Automation builder
--
-- The drag-and-drop workflow builder previously stored its in-progress
-- definition only in component memory; a tab close or refresh wiped 20+
-- minutes of work. This migration adds a server-side persistence layer
-- so drafts survive device switches. The frontend also keeps a
-- localStorage mirror for instant save and offline resilience.
--
-- Schema: one draft per (organization_id, user_id, name) — that lets a
-- user maintain multiple named drafts in parallel ("monthly invoice
-- follow-up", "overdue chaser", etc.). A 30-day TTL purge can be added
-- via a periodic cron later; for now drafts are explicitly deleted by
-- the user on publish or via a "Discard draft" action.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.workflow_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  definition      jsonb NOT NULL,        -- the serialised workflow graph
  last_saved_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_drafts_org_user
  ON public.workflow_drafts (organization_id, user_id, last_saved_at DESC);

ALTER TABLE public.workflow_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_drafts_select_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_select_own"
  ON public.workflow_drafts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         AND organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "workflow_drafts_insert_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_insert_own"
  ON public.workflow_drafts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "workflow_drafts_update_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_update_own"
  ON public.workflow_drafts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
         AND organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (user_id = auth.uid()
              AND organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "workflow_drafts_delete_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_delete_own"
  ON public.workflow_drafts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()
         AND organization_id = public.get_user_organization_id(auth.uid()));

-- Idempotent upsert RPC so the frontend can fire-and-forget on every
-- N-second auto-save. Defaults to current_user + current_org.
CREATE OR REPLACE FUNCTION public.save_workflow_draft(
  p_name        text,
  p_definition  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_id  uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Workflow draft name is required';
  END IF;

  INSERT INTO public.workflow_drafts (organization_id, user_id, name, definition, last_saved_at)
  VALUES (v_org, auth.uid(), p_name, p_definition, now())
  ON CONFLICT (organization_id, user_id, name)
  DO UPDATE SET definition = EXCLUDED.definition,
                last_saved_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_workflow_draft(text, jsonb) TO authenticated;
