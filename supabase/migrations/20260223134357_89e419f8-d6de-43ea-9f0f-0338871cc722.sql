
-- Fix numeric overflow: widen percentage and risk columns
ALTER TABLE public.ai_financial_snapshots ALTER COLUMN net_margin_pct TYPE NUMERIC(10,2);
ALTER TABLE public.ai_financial_snapshots ALTER COLUMN health_score TYPE NUMERIC(10,2);
ALTER TABLE public.ai_risk_scores ALTER COLUMN cash_risk TYPE NUMERIC(10,2);
ALTER TABLE public.ai_risk_scores ALTER COLUMN receivables_risk TYPE NUMERIC(10,2);
ALTER TABLE public.ai_risk_scores ALTER COLUMN margin_risk TYPE NUMERIC(10,2);
ALTER TABLE public.ai_risk_scores ALTER COLUMN compliance_risk TYPE NUMERIC(10,2);
ALTER TABLE public.ai_risk_scores ALTER COLUMN overall_risk TYPE NUMERIC(10,2);
