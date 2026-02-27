
-- Seed missing GL account 5100 into gl_accounts for all orgs that have it in chart_of_accounts
INSERT INTO public.gl_accounts (organization_id, code, name, account_type, is_active)
SELECT ca.organization_id, '5100', 'Operating Expenses', 'expense', true
FROM public.chart_of_accounts ca
WHERE ca.account_code = '5100'
AND NOT EXISTS (
  SELECT 1 FROM public.gl_accounts g WHERE g.organization_id = ca.organization_id AND g.code = '5100'
);
