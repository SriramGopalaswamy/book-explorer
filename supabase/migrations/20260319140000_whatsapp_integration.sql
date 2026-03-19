-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp Integration: templates table + supporting indexes
--
-- This migration adds first-class WhatsApp support to the messaging layer:
--   1. whatsapp_templates: pre-approved template registry
--   2. Index on messages(external_id) for status webhook lookups
--   3. Index on invoices(client_phone) for inbound message matching
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. WhatsApp Templates ────────────────────────────────────────────────────
-- Stores pre-approved WhatsApp Business API (HSM) templates.
-- Workflow steps reference templates by `name`, which resolves to the
-- provider-specific `template_name` and variable schema.

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Internal name used in workflow config (e.g. "invoice_reminder_1")
  name            TEXT        NOT NULL,
  -- Provider template name (e.g. "invoice_reminder_v1" as registered with Meta)
  template_name   TEXT        NOT NULL,
  -- JSON schema describing template variables
  -- e.g. {"1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date"}
  variables       JSONB       NOT NULL DEFAULT '{}',
  -- WhatsApp template category
  category        TEXT        NOT NULL DEFAULT 'UTILITY'
                    CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  -- Template language code (BCP 47)
  language        TEXT        NOT NULL DEFAULT 'en',
  -- Whether this template is active and approved by provider
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each org can only have one template with a given name
  UNIQUE (organization_id, name)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_whatsapp_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_templates_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org_name
  ON whatsapp_templates (organization_id, name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org_active
  ON whatsapp_templates (organization_id, is_active)
  WHERE is_active = true;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_admin_whatsapp_templates_select"
  ON whatsapp_templates FOR SELECT
  USING (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_whatsapp_templates_insert"
  ON whatsapp_templates FOR INSERT
  WITH CHECK (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_whatsapp_templates_update"
  ON whatsapp_templates FOR UPDATE
  USING (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_whatsapp_templates_delete"
  ON whatsapp_templates FOR DELETE
  USING (public.is_finance_or_admin(organization_id));

-- ── 2. Index on messages(external_id) for status webhook lookups ─────────────
CREATE INDEX IF NOT EXISTS idx_messages_external_id
  ON messages (external_id)
  WHERE external_id IS NOT NULL;

-- ── 3. Index on invoices(client_phone) for inbound WhatsApp matching ─────────
CREATE INDEX IF NOT EXISTS idx_invoices_client_phone
  ON invoices (client_phone)
  WHERE client_phone IS NOT NULL;

-- ── 4. Seed default WhatsApp templates for existing organizations ────────────
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    -- Invoice Reminder 1
    INSERT INTO whatsapp_templates (organization_id, name, template_name, variables, category, language)
    VALUES (
      org.id,
      'invoice_reminder_1',
      'invoice_payment_reminder',
      '{"1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date"}'::jsonb,
      'UTILITY',
      'en'
    )
    ON CONFLICT (organization_id, name) DO NOTHING;

    -- Invoice Reminder 2 (final)
    INSERT INTO whatsapp_templates (organization_id, name, template_name, variables, category, language)
    VALUES (
      org.id,
      'invoice_reminder_2',
      'invoice_final_reminder',
      '{"1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date"}'::jsonb,
      'UTILITY',
      'en'
    )
    ON CONFLICT (organization_id, name) DO NOTHING;

    -- Aliases: reminder_1 / reminder_2 (so email template names work for WhatsApp too)
    INSERT INTO whatsapp_templates (organization_id, name, template_name, variables, category, language)
    VALUES (
      org.id,
      'reminder_1',
      'invoice_payment_reminder',
      '{"1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date"}'::jsonb,
      'UTILITY',
      'en'
    )
    ON CONFLICT (organization_id, name) DO NOTHING;

    INSERT INTO whatsapp_templates (organization_id, name, template_name, variables, category, language)
    VALUES (
      org.id,
      'reminder_2',
      'invoice_final_reminder',
      '{"1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date"}'::jsonb,
      'UTILITY',
      'en'
    )
    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;
END $$;
