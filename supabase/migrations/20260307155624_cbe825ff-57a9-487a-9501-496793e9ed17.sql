
-- =====================================================
-- DPDPA / GDPR Compliance Tables
-- =====================================================

-- 1. Consent Records — tracks data processing consent per user
CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL, -- 'data_processing', 'marketing', 'analytics', 'third_party_sharing'
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawal_date TIMESTAMPTZ,
  ip_address TEXT,
  consent_version TEXT DEFAULT '1.0',
  purpose_description TEXT,
  legal_basis TEXT DEFAULT 'consent', -- 'consent', 'contract', 'legal_obligation', 'legitimate_interest'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consent records"
  ON public.consent_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own consent"
  ON public.consent_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own consent"
  ON public.consent_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 2. Data Erasure Requests — DPDPA Right to Erasure
CREATE TABLE public.data_erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  target_user_id UUID NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'erasure', -- 'erasure', 'anonymization', 'data_export'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected', 'partially_completed'
  reason TEXT,
  data_categories TEXT[] DEFAULT '{}', -- which data categories to erase
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  completion_notes TEXT,
  acknowledgment_number TEXT UNIQUE,
  deadline_date TIMESTAMPTZ, -- DPDPA requires response within 30 days
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_erasure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own erasure requests"
  ON public.data_erasure_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "Users can create erasure requests"
  ON public.data_erasure_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admins can manage erasure requests"
  ON public.data_erasure_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND p.organization_id = data_erasure_requests.organization_id
    )
  );

-- 3. Data Breach Log — DPDPA breach notification
CREATE TABLE public.data_breach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  breach_date TIMESTAMPTZ NOT NULL,
  detected_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_to_authority_date TIMESTAMPTZ,
  reported_to_users_date TIMESTAMPTZ,
  breach_type TEXT NOT NULL, -- 'unauthorized_access', 'data_leak', 'system_compromise', 'phishing', 'other'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  description TEXT NOT NULL,
  affected_data_types TEXT[] DEFAULT '{}',
  estimated_affected_count INTEGER DEFAULT 0,
  containment_actions TEXT,
  remediation_steps TEXT,
  dpo_notified BOOLEAN DEFAULT false,
  authority_notified BOOLEAN DEFAULT false, -- DPDPA: must notify Data Protection Board within 72 hours
  status TEXT NOT NULL DEFAULT 'detected', -- 'detected', 'investigating', 'contained', 'resolved', 'closed'
  reported_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_breach_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage breach log"
  ON public.data_breach_log FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND p.organization_id = data_breach_log.organization_id
    )
  );

-- 4. Session Security Config — per-org session policies
CREATE TABLE public.session_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  max_session_hours INTEGER NOT NULL DEFAULT 12,
  enforce_single_session BOOLEAN NOT NULL DEFAULT false,
  require_mfa BOOLEAN NOT NULL DEFAULT false,
  password_min_length INTEGER NOT NULL DEFAULT 8,
  password_require_uppercase BOOLEAN NOT NULL DEFAULT true,
  password_require_number BOOLEAN NOT NULL DEFAULT true,
  password_require_special BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view session policies"
  ON public.session_policies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = session_policies.organization_id
    )
  );

CREATE POLICY "Admins can manage session policies"
  ON public.session_policies FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND p.organization_id = session_policies.organization_id
    )
  );

-- Auto-set org triggers
CREATE OR REPLACE FUNCTION public.auto_set_consent_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT p.organization_id INTO NEW.organization_id
    FROM public.profiles p WHERE p.user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_set_consent_org
  BEFORE INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_consent_org();

CREATE OR REPLACE FUNCTION public.auto_set_erasure_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT p.organization_id INTO NEW.organization_id
    FROM public.profiles p WHERE p.user_id = NEW.requested_by LIMIT 1;
  END IF;
  -- Set deadline to 30 days from now per DPDPA
  IF NEW.deadline_date IS NULL THEN
    NEW.deadline_date := now() + INTERVAL '30 days';
  END IF;
  -- Generate acknowledgment number
  IF NEW.acknowledgment_number IS NULL THEN
    NEW.acknowledgment_number := 'DER-' || to_char(now(), 'YYYYMMDD') || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_set_erasure_org
  BEFORE INSERT ON public.data_erasure_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_erasure_org();

CREATE OR REPLACE FUNCTION public.auto_set_breach_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT p.organization_id INTO NEW.organization_id
    FROM public.profiles p WHERE p.user_id = NEW.reported_by LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_set_breach_org
  BEFORE INSERT ON public.data_breach_log
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_breach_org();
