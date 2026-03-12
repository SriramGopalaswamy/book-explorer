-- ═══════════════════════════════════════════════════════════════════════
-- FIX: gl_accounts.account_type — add 'contra_asset'
--
-- Root cause (R2_BS_EQUATION Equity=0):
-- The simulation seeds account 1510 (Accumulated Depreciation) with
-- account_type='contra_asset'. The existing CHECK constraint only allows
-- ('asset','liability','equity','revenue','expense'), so the upsert for
-- account 1510 silently fails. When the constraint check for
-- if (equityAcct && cashAcct && retainedAcct) runs, cashAcct (1000) IS
-- populated, equityAcct (3000) IS populated, but the accumDepAcct (1510)
-- insert failure causes downstream assertion problems in the BS calc:
-- contra_asset lines are ignored, creating the appearance of imbalance.
--
-- Additionally, the BS equation code handles 'contra_asset' as a separate
-- type in its switch statement — if the account_type is null in typeMap
-- (because the constraint rejected the insert), the BS equation silently
-- drops accumulated depreciation from the calculation entirely, making
-- Total Assets appear inflated vs. the right side.
--
-- Fix: expand the CHECK to include 'contra_asset'.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.gl_accounts
  DROP CONSTRAINT IF EXISTS gl_accounts_account_type_check;

ALTER TABLE public.gl_accounts
  ADD CONSTRAINT gl_accounts_account_type_check
  CHECK (account_type IN (
    'asset',         -- cash, receivables, inventory, fixed assets
    'contra_asset',  -- accumulated depreciation, allowance for doubtful accounts
    'liability',     -- payables, loans, accrued liabilities
    'equity',        -- share capital, retained earnings, reserves
    'revenue',       -- sales, service income
    'expense'        -- COGS, salaries, depreciation expense
  ));

-- Re-seed the contra_asset type for any existing rows that got stored as NULL
-- due to the constraint rejection (update to correct type for known GL codes)
UPDATE public.gl_accounts
  SET account_type = 'contra_asset'
  WHERE code IN ('1510', '1511', '1512')
    AND account_type IS DISTINCT FROM 'contra_asset';
