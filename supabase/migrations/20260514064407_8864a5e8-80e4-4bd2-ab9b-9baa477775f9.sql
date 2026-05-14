UPDATE public.subscriptions
SET enabled_modules = ARRAY['financial','hrms','performance','audit','assets','inventory','sales','procurement','manufacturing','warehouse','connectors']
WHERE organization_id = '00000000-0000-0000-0000-000000000001';