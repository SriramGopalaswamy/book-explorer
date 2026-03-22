-- ─────────────────────────────────────────────────────────────────────────────
-- whatsapp_templates: maps workflow template identifiers to provider templates.
-- Used by messaging-service when channel = "whatsapp".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Internal identifier used in workflow step config: { "template": "reminder_1" }
  name          TEXT        NOT NULL,
  -- Provider-side template name (e.g. Meta Business API template name)
  template_name TEXT        NOT NULL,
  -- Template variable definitions (JSON array of variable names)
  variables     JSONB       NOT NULL DEFAULT '[]',
  -- WhatsApp template category
  category      TEXT        NOT NULL DEFAULT 'UTILITY'
                  CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  -- BCP 47 language code
  language      TEXT        NOT NULL DEFAULT 'en',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per org + internal name
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_org_name
  ON public.whatsapp_templates (organization_id, name)
  WHERE organization_id IS NOT NULL;

-- Global templates (organization_id IS NULL) allowed for shared defaults
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_global
  ON public.whatsapp_templates (name)
  WHERE organization_id IS NULL;

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage whatsapp_templates"
  ON public.whatsapp_templates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('finance', 'admin', 'owner')
    )
    OR organization_id IS NULL
  );

-- ─── Seed: default templates ──────────────────────────────────────────────────
-- These are global defaults (organization_id IS NULL) that can be overridden per org.

INSERT INTO public.whatsapp_templates (organization_id, name, template_name, variables, category, language)
VALUES
  (NULL, 'reminder_1', 'invoice_reminder_first', '["invoice_number", "client_name", "amount", "due_date"]', 'UTILITY', 'en'),
  (NULL, 'reminder_2', 'invoice_reminder_final',  '["invoice_number", "client_name", "amount", "due_date"]', 'UTILITY', 'en')
ON CONFLICT DO NOTHING;
