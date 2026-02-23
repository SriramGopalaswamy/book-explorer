
-- Fix: ledger_base should use SECURITY INVOKER (default) so RLS applies per querying user
DROP VIEW IF EXISTS public.ledger_base;

CREATE VIEW public.ledger_base
WITH (security_invoker = true)
AS
SELECT
  je.organization_id,
  je.id           AS journal_entry_id,
  je.entry_date,
  je.fiscal_period_id,
  je.source_type  AS document_type,
  je.document_sequence_number,
  je.is_reversal,
  je.reversed_entry_id,
  je.memo,
  jl.id           AS line_id,
  jl.gl_account_id AS account_id,
  ga.code         AS account_code,
  ga.name         AS account_name,
  ga.account_type,
  ga.normal_balance,
  jl.debit,
  jl.credit,
  (jl.debit - jl.credit) AS net_amount,
  jl.description  AS line_description
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.gl_accounts   ga ON ga.id = jl.gl_account_id
WHERE je.is_posted = true;
