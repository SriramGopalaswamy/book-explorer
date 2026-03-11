/**
 * Tenant Controller
 *
 * HTTP layer for tenant customization endpoints
 * Handles settings, custom fields, and features
 */

const BaseController = require('../core/BaseController');
const logger = require('../utils/logger');

class TenantController extends BaseController {
  constructor(tenantService) {
    super();
    this.tenantService = tenantService;
  }

  // ==========================================
  // Settings Endpoints
  // ==========================================

  /**
   * Get all settings for organization
   * GET /api/tenant/settings
   */
  async getSettings(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { category } = req.query;

      const settings = await this.tenantService.getSettings(tenant.id, category);

      return this.success(res, settings, 'Settings retrieved successfully');
    })(req, res, next);
  }

  /**
   * Get settings by category
   * GET /api/tenant/settings/:category
   */
  async getSettingsByCategory(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { category } = req.params;

      const settings = await this.tenantService.getSettingsByCategory(tenant.id, category);

      return this.success(res, settings, 'Settings retrieved successfully');
    })(req, res, next);
  }

  /**
   * Update setting
   * PUT /api/tenant/settings/:category/:key
   */
  async updateSetting(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { category, key } = req.params;
      const { value } = req.body;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const setting = await this.tenantService.updateSetting(
        tenant.id,
        category,
        key,
        value,
        context
      );

      logger.logAudit('UPDATE_SETTING', setting.id, context);

      return this.success(res, setting, 'Setting updated successfully');
    })(req, res, next);
  }

  /**
   * Bulk update settings
   * POST /api/tenant/settings/bulk
   */
  async bulkUpdateSettings(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { settings } = req.body;

      if (!Array.isArray(settings)) {
        return this.validationError(res, [
          { field: 'settings', message: 'Settings must be an array' }
        ]);
      }

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const results = await this.tenantService.bulkUpdateSettings(
        tenant.id,
        settings,
        context
      );

      logger.logAudit('BULK_UPDATE_SETTINGS', tenant.id, context);

      return this.success(res, results, `${results.length} settings updated successfully`);
    })(req, res, next);
  }

  // ==========================================
  // Custom Fields Endpoints
  // ==========================================

  /**
   * Get custom fields for entity type
   * GET /api/tenant/custom-fields/:entityType
   */
  async getCustomFields(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { entityType } = req.params;

      const fields = await this.tenantService.getCustomFields(tenant.id, entityType);

      return this.success(res, fields, 'Custom fields retrieved successfully');
    })(req, res, next);
  }

  /**
   * Create custom field
   * POST /api/tenant/custom-fields
   */
  async createCustomField(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const customField = await this.tenantService.createCustomField(
        tenant.id,
        req.body,
        context
      );

      logger.logAudit('CREATE_CUSTOM_FIELD', customField.id, context);

      return this.created(res, customField, 'Custom field created successfully');
    })(req, res, next);
  }

  /**
   * Update custom field
   * PUT /api/tenant/custom-fields/:id
   */
  async updateCustomField(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const customField = await this.tenantService.updateCustomField(
        tenant.id,
        id,
        req.body,
        context
      );

      logger.logAudit('UPDATE_CUSTOM_FIELD', id, context);

      return this.success(res, customField, 'Custom field updated successfully');
    })(req, res, next);
  }

  /**
   * Delete custom field
   * DELETE /api/tenant/custom-fields/:id
   */
  async deleteCustomField(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      await this.tenantService.delete(id, context);

      logger.logAudit('DELETE_CUSTOM_FIELD', id, context);

      return this.success(res, null, 'Custom field deleted successfully');
    })(req, res, next);
  }

  /**
   * Get entity custom field values
   * GET /api/tenant/custom-fields/:entityType/:entityId/values
   */
  async getEntityCustomFieldValues(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { entityType, entityId } = req.params;

      const values = await this.tenantService.getEntityCustomFieldValues(
        tenant.id,
        entityType,
        entityId
      );

      return this.success(res, values, 'Custom field values retrieved successfully');
    })(req, res, next);
  }

  /**
   * Set entity custom field values
   * POST /api/tenant/custom-fields/:entityType/:entityId/values
   */
  async setEntityCustomFieldValues(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { entityType, entityId } = req.params;
      const { fieldValues } = req.body;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const results = await this.tenantService.setCustomFieldValues(
        tenant.id,
        entityType,
        entityId,
        fieldValues,
        context
      );

      logger.logAudit('SET_CUSTOM_FIELD_VALUES', entityId, context);

      return this.success(res, results, 'Custom field values set successfully');
    })(req, res, next);
  }

  // ==========================================
  // Features Endpoints
  // ==========================================

  /**
   * Get all features for organization
   * GET /api/tenant/features
   */
  async getFeatures(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);

      const features = await this.tenantService.getFeatures(tenant.id);

      return this.success(res, features, 'Features retrieved successfully');
    })(req, res, next);
  }

  /**
   * Check if feature is enabled
   * GET /api/tenant/features/:featureKey/enabled
   */
  async isFeatureEnabled(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { featureKey } = req.params;

      const isEnabled = await this.tenantService.isFeatureEnabled(tenant.id, featureKey);

      return this.success(res, { enabled: isEnabled }, 'Feature status retrieved successfully');
    })(req, res, next);
  }

  /**
   * Toggle feature
   * POST /api/tenant/features/:featureKey/toggle
   */
  async toggleFeature(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { featureKey } = req.params;
      const { enabled } = req.body;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const feature = await this.tenantService.toggleFeature(
        tenant.id,
        featureKey,
        enabled,
        context
      );

      logger.logAudit('TOGGLE_FEATURE', featureKey, context, { enabled });

      return this.success(res, feature, `Feature ${enabled ? 'enabled' : 'disabled'} successfully`);
    })(req, res, next);
  }

  // ==========================================
  // Helper Endpoints
  // ==========================================

  /**
   * Get tenant configuration
   * GET /api/tenant/config
   */
  async getTenantConfig(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);

      // Get all tenant configuration in one call
      const [settings, features] = await Promise.all([
        this.tenantService.getSettings(tenant.id),
        this.tenantService.getFeatures(tenant.id)
      ]);

      const config = {
        organization: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          subscription_tier: tenant.subscription_tier
        },
        settings: this.groupSettingsByCategory(settings),
        features: features.filter(f => f.is_enabled).map(f => f.feature_key),
        enabledFeatures: features.filter(f => f.is_enabled)
      };

      return this.success(res, config, 'Tenant configuration retrieved successfully');
    })(req, res, next);
  }

  /**
   * Group settings by category
   * @param {Array} settings - Settings array
   * @returns {Object} Grouped settings
   */
  groupSettingsByCategory(settings) {
    const grouped = {};

    settings.forEach(setting => {
      if (!grouped[setting.category]) {
        grouped[setting.category] = {};
      }
      grouped[setting.category][setting.setting_key] = setting.setting_value;
    });

    return grouped;
  }
}

module.exports = TenantController;
