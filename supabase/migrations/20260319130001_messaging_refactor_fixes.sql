-- ─────────────────────────────────────────────────────────────────────────────
-- messaging_refactor_fixes: addresses all gaps found in the audit of the
-- channel-agnostic messaging layer introduced in 20260319*
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add client_phone to invoices (required for WhatsApp recipient resolution)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_phone TEXT;

-- ── 2. Add updated_at to messages (needed to track when classification changed)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;
CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_messages_updated_at();

-- ── 3. Add FK constraints that were missing ───────────────────────────────────

-- workflow_runs.organization_id → organizations(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'workflow_runs'
      AND constraint_name = 'workflow_runs_organization_id_fkey'
  ) THEN
    ALTER TABLE public.workflow_runs
      ADD CONSTRAINT workflow_runs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- workflow_events.organization_id → organizations(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'workflow_events'
      AND constraint_name = 'workflow_events_organization_id_fkey'
  ) THEN
    ALTER TABLE public.workflow_events
      ADD CONSTRAINT workflow_events_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 4. Add index on workflow_events(entity_id) for enrichment queries ─────────
CREATE INDEX IF NOT EXISTS idx_workflow_events_entity_id
  ON public.workflow_events (entity_id)
  WHERE entity_id IS NOT NULL;

-- ── 5. Expand invoices.status CHECK to include 'dispute' ──────────────────────
--    (email_logs migration already added 'acknowledged', this adds 'dispute'
--     if not already present)
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'acknowledged', 'dispute'));
