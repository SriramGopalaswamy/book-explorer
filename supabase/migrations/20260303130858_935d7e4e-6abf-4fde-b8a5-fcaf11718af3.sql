
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS tds_section text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tds_rate numeric DEFAULT NULL;

COMMENT ON COLUMN public.bills.tds_section IS 'TDS section code e.g. 194C, 194J, 194H, 194I, 194IA, 194IB';
COMMENT ON COLUMN public.bills.tds_rate IS 'TDS deduction rate percentage for the selected section';
