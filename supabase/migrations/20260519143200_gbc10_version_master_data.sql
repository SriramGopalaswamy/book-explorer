-- GBC-10: optimistic concurrency on master-data tables.
--
-- T3 (migration 20260508051926) added a `version` column + bump trigger to
-- 12 doc tables, but the issue's named list of master-data tables —
-- profiles, items (a.k.a. inventory_items in the Jira), salary_structures,
-- payroll_records — was skipped. Two users editing the same record can
-- silently overwrite each other on these tables today.
--
-- This migration ships the schema half: ADD COLUMN version + BEFORE UPDATE
-- trigger bumping it. FE adoption (.eq("version", expected) on every UPDATE)
-- is deferred to a follow-up commit; this lands the gate.
--
-- financial_records is intentionally NOT included — CLAUDE.md item 23 says
-- those rows are trigger-owned via trg_sync_financial_records when they
-- carry a journal_entry_id. Versioning them would fight the projection.

-- ─── Shared bump function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── ADD COLUMN + trigger per table ─────────────────────────────────────
ALTER TABLE public.profiles            ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.items               ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.salary_structures   ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.payroll_records     ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS trg_bump_version_profiles          ON public.profiles;
DROP TRIGGER IF EXISTS trg_bump_version_items             ON public.items;
DROP TRIGGER IF EXISTS trg_bump_version_salary_structures ON public.salary_structures;
DROP TRIGGER IF EXISTS trg_bump_version_payroll_records   ON public.payroll_records;

CREATE TRIGGER trg_bump_version_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE TRIGGER trg_bump_version_items
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE TRIGGER trg_bump_version_salary_structures
  BEFORE UPDATE ON public.salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE TRIGGER trg_bump_version_payroll_records
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

COMMENT ON FUNCTION public.bump_row_version() IS
  'GBC-10: BEFORE UPDATE trigger fn that increments NEW.version when the row content actually changed. Frontends should pass .eq("version", expected) on UPDATE; 0 rows affected ⇒ conflict, refresh-and-retry.';
