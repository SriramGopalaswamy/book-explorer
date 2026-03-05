-- Fix gl_accounts FK constraints to CASCADE
ALTER TABLE public.journal_lines DROP CONSTRAINT journal_lines_gl_account_id_fkey;
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_gl_account_id_fkey 
  FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.budgets DROP CONSTRAINT budgets_account_id_fkey;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_account_id_fkey 
  FOREIGN KEY (account_id) REFERENCES public.gl_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.control_account_overrides DROP CONSTRAINT control_account_overrides_gl_account_id_fkey;
ALTER TABLE public.control_account_overrides ADD CONSTRAINT control_account_overrides_gl_account_id_fkey 
  FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.gl_accounts DROP CONSTRAINT gl_accounts_parent_id_fkey;
ALTER TABLE public.gl_accounts ADD CONSTRAINT gl_accounts_parent_id_fkey 
  FOREIGN KEY (parent_id) REFERENCES public.gl_accounts(id) ON DELETE SET NULL;

-- Update delete_sandbox_org to disable protective triggers before deletion
CREATE OR REPLACE FUNCTION public.delete_sandbox_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can delete sandbox';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = _org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Cannot delete: organization is not a sandbox';
  END IF;

  -- Disable protective triggers on journal tables and GL accounts
  ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_mutation;
  ALTER TABLE public.journal_lines DISABLE TRIGGER trg_immutable_jl;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_je_mutation;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_immutable_je;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal_balance;
  ALTER TABLE public.gl_accounts DISABLE TRIGGER trg_protect_gl_delete;
  ALTER TABLE public.gl_accounts DISABLE TRIGGER trg_protect_gl_update;

  -- Delete sandbox users
  DELETE FROM public.sandbox_users WHERE sandbox_org_id = _org_id;
  
  -- Delete the org (cascades to all child tables)
  DELETE FROM public.organizations WHERE id = _org_id AND environment_type = 'sandbox';

  -- Re-enable all triggers
  ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_mutation;
  ALTER TABLE public.journal_lines ENABLE TRIGGER trg_immutable_jl;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_je_mutation;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_immutable_je;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal_balance;
  ALTER TABLE public.gl_accounts ENABLE TRIGGER trg_protect_gl_delete;
  ALTER TABLE public.gl_accounts ENABLE TRIGGER trg_protect_gl_update;
END;
$$;