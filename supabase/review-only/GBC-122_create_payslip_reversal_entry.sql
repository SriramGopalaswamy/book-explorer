-- ─────────────────────────────────────────────────────────────────────────────
-- REVIEW-ONLY MIGRATION — DO NOT APPLY DIRECTLY
-- GBC-122: create_payslip_reversal_entry RPC
--
-- Purpose: when a payslip dispute is RESOLVED with a corrective adjustment,
-- the original payroll_entries row is marked `superseded` and a new row is
-- inserted. The corresponding GL impact must be reversed (debit ↔ credit
-- swap of the original payroll posting) and a fresh entry posted for the
-- corrected amounts. This RPC creates the reversal journal_entry +
-- journal_lines atomically and returns the new journal_entry_id.
--
-- Wire-in (frontend): src/hooks/usePayslipDisputes.ts → on resolve, after
--   marking entry superseded and inserting the corrected row, call:
--     await supabase.rpc("create_payslip_reversal_entry", {
--       p_original_entry_id: originalEntryId,
--       p_corrected_entry_id: correctedEntryId,
--       p_dispute_id: dispute.id,
--     });
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_payslip_reversal_entry(
  p_original_entry_id  uuid,
  p_corrected_entry_id uuid,
  p_dispute_id         uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id            uuid;
  v_original_je_id    uuid;
  v_reversal_je_id    uuid;
  v_pay_period        text;
  v_caller_org        uuid;
BEGIN
  -- Resolve caller org server-side (do not trust client)
  SELECT organization_id INTO v_caller_org
  FROM public.profiles
  WHERE user_id = auth.uid();
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization context';
  END IF;

  -- Load original entry + verify tenant
  SELECT pe.organization_id, pe.journal_entry_id, pr.pay_period
  INTO v_org_id, v_original_je_id, v_pay_period
  FROM public.payroll_entries pe
  JOIN public.payroll_runs pr ON pr.id = pe.payroll_run_id
  WHERE pe.id = p_original_entry_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Original payroll entry % not found', p_original_entry_id;
  END IF;
  IF v_org_id <> v_caller_org THEN
    RAISE EXCEPTION 'Cross-tenant reversal blocked';
  END IF;
  IF v_original_je_id IS NULL THEN
    RAISE EXCEPTION 'Original entry has no posted journal_entry to reverse';
  END IF;

  -- Create reversal journal_entry header
  INSERT INTO public.journal_entries(
    organization_id, entry_date, source_type, source_id,
    description, posted, created_by
  )
  VALUES (
    v_org_id, CURRENT_DATE, 'payslip_reversal', p_dispute_id,
    'Payslip dispute reversal for ' || v_pay_period
      || ' (entry ' || p_original_entry_id || ')',
    true, auth.uid()
  )
  RETURNING id INTO v_reversal_je_id;

  -- Mirror lines with debit ↔ credit swapped
  INSERT INTO public.journal_lines(
    journal_entry_id, account_id, debit, credit, description, organization_id
  )
  SELECT v_reversal_je_id, account_id, credit, debit,
         'REVERSAL: ' || COALESCE(description, ''), organization_id
  FROM public.journal_lines
  WHERE journal_entry_id = v_original_je_id;

  -- Mark original entry superseded (idempotent)
  UPDATE public.payroll_entries
     SET status = 'superseded',
         updated_at = now()
   WHERE id = p_original_entry_id
     AND status <> 'superseded';

  -- Link the corrected entry's JE (if it has one) — caller is responsible
  -- for posting the new entry; this RPC only reverses the original.

  RETURN v_reversal_je_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payslip_reversal_entry(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_payslip_reversal_entry(uuid, uuid, uuid) TO authenticated;
