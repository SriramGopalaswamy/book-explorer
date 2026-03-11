-- ================================================
-- Multi-Tenant Architecture Schema
-- ================================================
-- Adds support for tenant customization, custom fields,
-- feature flags, and module enablement

-- ================================================
-- 1. Tenant Settings Table
-- ================================================
-- Stores organization-specific settings and preferences
CREATE TABLE IF NOT EXISTS grxbooks.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL, -- e.g., 'general', 'payroll', 'hrms', 'notifications'
  setting_key VARCHAR(255) NOT NULL,
  setting_value JSONB NOT NULL,
  data_type VARCHAR(50) NOT NULL, -- 'string', 'number', 'boolean', 'json', 'date'
  is_encrypted BOOLEAN DEFAULT false,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, category, setting_key)
);

CREATE INDEX idx_tenant_settings_org ON grxbooks.tenant_settings(organization_id);
CREATE INDEX idx_tenant_settings_category ON grxbooks.tenant_settings(category);
CREATE INDEX idx_tenant_settings_key ON grxbooks.tenant_settings(setting_key);

COMMENT ON TABLE grxbooks.tenant_settings IS 'Organization-specific settings and configurations';

-- ================================================
-- 2. Custom Fields Table
-- ================================================
-- Allows tenants to add custom fields to any entity
CREATE TABLE IF NOT EXISTS grxbooks.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL, -- 'employee', 'department', 'project', etc.
  field_name VARCHAR(255) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'date', 'select', 'multi_select', 'boolean', 'file'
  field_options JSONB, -- For select/multi_select types
  default_value TEXT,
  is_required BOOLEAN DEFAULT false,
  is_searchable BOOLEAN DEFAULT false,
  is_filterable BOOLEAN DEFAULT false,
  validation_rules JSONB, -- e.g., { "min": 0, "max": 100, "pattern": "regex" }
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  help_text TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, entity_type, field_name)
);

CREATE INDEX idx_custom_fields_org ON grxbooks.custom_fields(organization_id);
CREATE INDEX idx_custom_fields_entity ON grxbooks.custom_fields(entity_type);
CREATE INDEX idx_custom_fields_active ON grxbooks.custom_fields(is_active);
CREATE INDEX idx_custom_fields_deleted ON grxbooks.custom_fields(deleted_at);

COMMENT ON TABLE grxbooks.custom_fields IS 'Custom field definitions for tenant entities';

-- ================================================
-- 3. Custom Field Values Table
-- ================================================
-- Stores actual values for custom fields
CREATE TABLE IF NOT EXISTS grxbooks.custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES grxbooks.custom_fields(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL, -- ID of the record (employee, department, etc.)
  field_value JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(custom_field_id, entity_id)
);

CREATE INDEX idx_custom_field_values_org ON grxbooks.custom_field_values(organization_id);
CREATE INDEX idx_custom_field_values_field ON grxbooks.custom_field_values(custom_field_id);
CREATE INDEX idx_custom_field_values_entity ON grxbooks.custom_field_values(entity_type, entity_id);

COMMENT ON TABLE grxbooks.custom_field_values IS 'Values for custom fields per entity instance';

-- ================================================
-- 4. Tenant Features Table
-- ================================================
-- Feature flags per organization
CREATE TABLE IF NOT EXISTS grxbooks.tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  feature_key VARCHAR(255) NOT NULL,
  feature_name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  configuration JSONB, -- Feature-specific configuration
  tier_restriction VARCHAR(50), -- 'free', 'basic', 'pro', 'enterprise'
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, feature_key)
);

CREATE INDEX idx_tenant_features_org ON grxbooks.tenant_features(organization_id);
CREATE INDEX idx_tenant_features_enabled ON grxbooks.tenant_features(is_enabled);
CREATE INDEX idx_tenant_features_key ON grxbooks.tenant_features(feature_key);

COMMENT ON TABLE grxbooks.tenant_features IS 'Feature flags and configurations per organization';

-- ================================================
-- 5. Tenant Modules Table
-- ================================================
-- Enable/disable entire modules per organization
CREATE TABLE IF NOT EXISTS grxbooks.tenant_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL, -- 'hrms', 'payroll', 'attendance', 'performance', etc.
  module_name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  settings JSONB, -- Module-specific settings
  tier_restriction VARCHAR(50), -- Minimum tier required
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, module_key)
);

CREATE INDEX idx_tenant_modules_org ON grxbooks.tenant_modules(organization_id);
CREATE INDEX idx_tenant_modules_enabled ON grxbooks.tenant_modules(is_enabled);
CREATE INDEX idx_tenant_modules_key ON grxbooks.tenant_modules(module_key);

COMMENT ON TABLE grxbooks.tenant_modules IS 'Module enablement per organization';

-- ================================================
-- 6. Tenant Branding Table
-- ================================================
-- Custom branding per organization
CREATE TABLE IF NOT EXISTS grxbooks.tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color VARCHAR(7), -- Hex color
  secondary_color VARCHAR(7),
  accent_color VARCHAR(7),
  favicon_url TEXT,
  custom_css TEXT,
  email_header_html TEXT,
  email_footer_html TEXT,
  login_background_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX idx_tenant_branding_org ON grxbooks.tenant_branding(organization_id);

COMMENT ON TABLE grxbooks.tenant_branding IS 'Custom branding and theme per organization';

-- ================================================
-- 7. Tenant Workflows Table
-- ================================================
-- Custom approval workflows per organization
CREATE TABLE IF NOT EXISTS grxbooks.tenant_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  workflow_name VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100) NOT NULL, -- 'leave_request', 'expense', 'timesheet', etc.
  trigger_event VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'status_change'
  workflow_definition JSONB NOT NULL, -- Steps, approvers, conditions
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_tenant_workflows_org ON grxbooks.tenant_workflows(organization_id);
CREATE INDEX idx_tenant_workflows_entity ON grxbooks.tenant_workflows(entity_type);
CREATE INDEX idx_tenant_workflows_active ON grxbooks.tenant_workflows(is_active);

COMMENT ON TABLE grxbooks.tenant_workflows IS 'Custom approval workflows per organization';

-- ================================================
-- 8. Tenant Integrations Table
-- ================================================
-- External integrations per organization
CREATE TABLE IF NOT EXISTS grxbooks.tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id) ON DELETE CASCADE,
  integration_type VARCHAR(100) NOT NULL, -- 'slack', 'ms_teams', 'google_workspace', etc.
  integration_name VARCHAR(255) NOT NULL,
  credentials JSONB NOT NULL, -- Encrypted credentials
  configuration JSONB, -- Integration-specific settings
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status VARCHAR(50), -- 'success', 'failed', 'in_progress'
  sync_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, integration_type)
);

CREATE INDEX idx_tenant_integrations_org ON grxbooks.tenant_integrations(organization_id);
CREATE INDEX idx_tenant_integrations_type ON grxbooks.tenant_integrations(integration_type);
CREATE INDEX idx_tenant_integrations_active ON grxbooks.tenant_integrations(is_active);

COMMENT ON TABLE grxbooks.tenant_integrations IS 'External integrations per organization';

-- ================================================
-- 9. Insert Default Settings
-- ================================================

-- Default features available
INSERT INTO grxbooks.tenant_features (organization_id, feature_key, feature_name, is_enabled, tier_restriction)
SELECT
  id,
  'employee_management',
  'Employee Management',
  true,
  'free'
FROM grxbooks.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM grxbooks.tenant_features
  WHERE organization_id = grxbooks.organizations.id
  AND feature_key = 'employee_management'
);

INSERT INTO grxbooks.tenant_features (organization_id, feature_key, feature_name, is_enabled, tier_restriction)
SELECT
  id,
  'advanced_reporting',
  'Advanced Reporting',
  false,
  'pro'
FROM grxbooks.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM grxbooks.tenant_features
  WHERE organization_id = grxbooks.organizations.id
  AND feature_key = 'advanced_reporting'
);

-- Default modules
INSERT INTO grxbooks.tenant_modules (organization_id, module_key, module_name, is_enabled, tier_restriction)
SELECT
  id,
  'hrms',
  'Human Resource Management',
  true,
  'free'
FROM grxbooks.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM grxbooks.tenant_modules
  WHERE organization_id = grxbooks.organizations.id
  AND module_key = 'hrms'
);

-- ================================================
-- 10. Functions for Custom Fields
-- ================================================

-- Function to get custom fields for an entity
CREATE OR REPLACE FUNCTION grxbooks.get_entity_custom_fields(
  p_organization_id UUID,
  p_entity_type VARCHAR,
  p_entity_id UUID
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    cf.field_name,
    COALESCE(cfv.field_value, cf.default_value)
  ) INTO result
  FROM grxbooks.custom_fields cf
  LEFT JOIN grxbooks.custom_field_values cfv
    ON cf.id = cfv.custom_field_id
    AND cfv.entity_id = p_entity_id
  WHERE cf.organization_id = p_organization_id
    AND cf.entity_type = p_entity_type
    AND cf.is_active = true
    AND cf.deleted_at IS NULL;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if feature is enabled
CREATE OR REPLACE FUNCTION grxbooks.is_feature_enabled(
  p_organization_id UUID,
  p_feature_key VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  is_enabled BOOLEAN;
BEGIN
  SELECT tf.is_enabled INTO is_enabled
  FROM grxbooks.tenant_features tf
  WHERE tf.organization_id = p_organization_id
    AND tf.feature_key = p_feature_key;

  RETURN COALESCE(is_enabled, false);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if module is enabled
CREATE OR REPLACE FUNCTION grxbooks.is_module_enabled(
  p_organization_id UUID,
  p_module_key VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  is_enabled BOOLEAN;
BEGIN
  SELECT tm.is_enabled INTO is_enabled
  FROM grxbooks.tenant_modules tm
  WHERE tm.organization_id = p_organization_id
    AND tm.module_key = p_module_key;

  RETURN COALESCE(is_enabled, false);
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================
-- 11. Triggers for updated_at
-- ================================================

CREATE OR REPLACE FUNCTION grxbooks.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON grxbooks.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_custom_fields_updated_at
  BEFORE UPDATE ON grxbooks.custom_fields
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON grxbooks.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_tenant_features_updated_at
  BEFORE UPDATE ON grxbooks.tenant_features
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_tenant_modules_updated_at
  BEFORE UPDATE ON grxbooks.tenant_modules
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_tenant_branding_updated_at
  BEFORE UPDATE ON grxbooks.tenant_branding
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_tenant_workflows_updated_at
  BEFORE UPDATE ON grxbooks.tenant_workflows
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

CREATE TRIGGER update_tenant_integrations_updated_at
  BEFORE UPDATE ON grxbooks.tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION grxbooks.update_updated_at_column();

-- ================================================
-- 12. RLS Policies
-- ================================================

-- Enable RLS on all tables
ALTER TABLE grxbooks.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.tenant_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE grxbooks.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- Policies for tenant_settings
CREATE POLICY tenant_settings_select_policy ON grxbooks.tenant_settings
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM grxbooks.user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_settings_insert_policy ON grxbooks.tenant_settings
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM grxbooks.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

CREATE POLICY tenant_settings_update_policy ON grxbooks.tenant_settings
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM grxbooks.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

-- Similar policies for other tables (abbreviated for brevity)

COMMENT ON TABLE grxbooks.tenant_settings IS 'Multi-tenant settings with RLS enabled';
