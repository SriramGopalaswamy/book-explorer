/**
 * Tenant Service
 *
 * Business logic for tenant customization and management
 * Handles settings, features, modules, and custom fields
 */

const BaseService = require('../core/BaseService');
const { ValidationError, BusinessLogicError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class TenantService extends BaseService {
  constructor(
    tenantSettingsRepository,
    customFieldsRepository,
    tenantFeaturesRepository
  ) {
    super(tenantSettingsRepository);
    this.tenantSettingsRepository = tenantSettingsRepository;
    this.customFieldsRepository = customFieldsRepository;
    this.tenantFeaturesRepository = tenantFeaturesRepository;
  }

  // ==========================================
  // Tenant Settings Methods
  // ==========================================

  /**
   * Get all settings for organization
   * @param {String} organizationId - Organization ID
   * @param {String} category - Optional category filter
   * @returns {Promise<Array>} Settings
   */
  async getSettings(organizationId, category = null) {
    try {
      const settings = await this.tenantSettingsRepository.getOrganizationSettings(
        organizationId,
        category
      );

      return settings;
    } catch (error) {
      logger.error('TenantService.getSettings error:', error);
      throw error;
    }
  }

  /**
   * Get settings by category as key-value object
   * @param {String} organizationId - Organization ID
   * @param {String} category - Category
   * @returns {Promise<Object>} Settings object
   */
  async getSettingsByCategory(organizationId, category) {
    try {
      return await this.tenantSettingsRepository.getSettingsByCategory(
        organizationId,
        category
      );
    } catch (error) {
      logger.error('TenantService.getSettingsByCategory error:', error);
      throw error;
    }
  }

  /**
   * Update setting
   * @param {String} organizationId - Organization ID
   * @param {String} category - Category
   * @param {String} key - Setting key
   * @param {*} value - Setting value
   * @param {Object} context - User context
   * @returns {Promise<Object>} Updated setting
   */
  async updateSetting(organizationId, category, key, value, context) {
    try {
      // Validate value based on data type
      const dataType = this.inferDataType(value);

      const setting = await this.tenantSettingsRepository.upsertSetting({
        organization_id: organizationId,
        category,
        setting_key: key,
        setting_value: value,
        data_type: dataType,
        created_by: context.userId,
        updated_by: context.userId
      });

      logger.logBusiness('tenant_setting_updated', {
        organizationId,
        category,
        key,
        userId: context.userId
      });

      return setting;
    } catch (error) {
      logger.error('TenantService.updateSetting error:', error);
      throw error;
    }
  }

  /**
   * Bulk update settings
   * @param {String} organizationId - Organization ID
   * @param {Array} settings - Array of settings
   * @param {Object} context - User context
   * @returns {Promise<Array>} Updated settings
   */
  async bulkUpdateSettings(organizationId, settings, context) {
    try {
      const results = await this.tenantSettingsRepository.bulkUpsertSettings(
        organizationId,
        settings,
        context.userId
      );

      logger.logBusiness('tenant_settings_bulk_updated', {
        organizationId,
        count: settings.length,
        userId: context.userId
      });

      return results;
    } catch (error) {
      logger.error('TenantService.bulkUpdateSettings error:', error);
      throw error;
    }
  }

  // ==========================================
  // Custom Fields Methods
  // ==========================================

  /**
   * Get custom fields for entity type
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @returns {Promise<Array>} Custom fields
   */
  async getCustomFields(organizationId, entityType) {
    try {
      return await this.customFieldsRepository.getEntityCustomFields(
        organizationId,
        entityType
      );
    } catch (error) {
      logger.error('TenantService.getCustomFields error:', error);
      throw error;
    }
  }

  /**
   * Create custom field
   * @param {String} organizationId - Organization ID
   * @param {Object} data - Custom field data
   * @param {Object} context - User context
   * @returns {Promise<Object>} Created custom field
   */
  async createCustomField(organizationId, data, context) {
    try {
      // Validate field name uniqueness
      const exists = await this.customFieldsRepository.fieldNameExists(
        organizationId,
        data.entity_type,
        data.field_name
      );

      if (exists) {
        throw new BusinessLogicError(
          `Custom field '${data.field_name}' already exists for ${data.entity_type}`
        );
      }

      // Validate field configuration
      this.validateCustomFieldData(data);

      const customField = await this.customFieldsRepository.create({
        organization_id: organizationId,
        entity_type: data.entity_type,
        field_name: data.field_name,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        default_value: data.default_value,
        is_required: data.is_required || false,
        is_searchable: data.is_searchable || false,
        is_filterable: data.is_filterable || false,
        validation_rules: data.validation_rules,
        display_order: data.display_order || 0,
        help_text: data.help_text,
        created_by: context.userId
      });

      logger.logBusiness('custom_field_created', {
        organizationId,
        entityType: data.entity_type,
        fieldName: data.field_name,
        userId: context.userId
      });

      return customField;
    } catch (error) {
      logger.error('TenantService.createCustomField error:', error);
      throw error;
    }
  }

  /**
   * Update custom field
   * @param {String} organizationId - Organization ID
   * @param {String} customFieldId - Custom field ID
   * @param {Object} data - Update data
   * @param {Object} context - User context
   * @returns {Promise<Object>} Updated custom field
   */
  async updateCustomField(organizationId, customFieldId, data, context) {
    try {
      // Check if field exists
      const existing = await this.customFieldsRepository.getCustomFieldById(
        customFieldId,
        organizationId
      );

      if (!existing) {
        throw new NotFoundError('Custom field not found');
      }

      // Validate field configuration
      if (data.field_type || data.field_options || data.validation_rules) {
        this.validateCustomFieldData({ ...existing, ...data });
      }

      const customField = await this.customFieldsRepository.update(customFieldId, {
        ...data,
        updated_by: context.userId
      });

      logger.logBusiness('custom_field_updated', {
        organizationId,
        customFieldId,
        userId: context.userId
      });

      return customField;
    } catch (error) {
      logger.error('TenantService.updateCustomField error:', error);
      throw error;
    }
  }

  /**
   * Get entity with custom field values
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {String} entityId - Entity ID
   * @returns {Promise<Object>} Custom fields with values
   */
  async getEntityCustomFieldValues(organizationId, entityType, entityId) {
    try {
      return await this.customFieldsRepository.getEntityCustomFieldValues(
        organizationId,
        entityType,
        entityId
      );
    } catch (error) {
      logger.error('TenantService.getEntityCustomFieldValues error:', error);
      throw error;
    }
  }

  /**
   * Set custom field values for entity
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {String} entityId - Entity ID
   * @param {Object} fieldValues - Field values
   * @param {Object} context - User context
   * @returns {Promise<Array>} Set values
   */
  async setCustomFieldValues(organizationId, entityType, entityId, fieldValues, context) {
    try {
      // Validate field values
      await this.validateCustomFieldValues(organizationId, entityType, fieldValues);

      const results = await this.customFieldsRepository.bulkSetCustomFieldValues(
        organizationId,
        entityType,
        entityId,
        fieldValues,
        context.userId
      );

      logger.logBusiness('custom_field_values_set', {
        organizationId,
        entityType,
        entityId,
        fieldCount: Object.keys(fieldValues).length,
        userId: context.userId
      });

      return results;
    } catch (error) {
      logger.error('TenantService.setCustomFieldValues error:', error);
      throw error;
    }
  }

  // ==========================================
  // Feature Flags Methods
  // ==========================================

  /**
   * Get all features for organization
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Array>} Features
   */
  async getFeatures(organizationId) {
    try {
      return await this.tenantFeaturesRepository.getOrganizationFeatures(organizationId);
    } catch (error) {
      logger.error('TenantService.getFeatures error:', error);
      throw error;
    }
  }

  /**
   * Check if feature is enabled
   * @param {String} organizationId - Organization ID
   * @param {String} featureKey - Feature key
   * @returns {Promise<Boolean>} Is enabled
   */
  async isFeatureEnabled(organizationId, featureKey) {
    try {
      return await this.tenantFeaturesRepository.isFeatureEnabled(
        organizationId,
        featureKey
      );
    } catch (error) {
      logger.error('TenantService.isFeatureEnabled error:', error);
      throw error;
    }
  }

  /**
   * Toggle feature
   * @param {String} organizationId - Organization ID
   * @param {String} featureKey - Feature key
   * @param {Boolean} enabled - Enable or disable
   * @param {Object} context - User context
   * @returns {Promise<Object>} Updated feature
   */
  async toggleFeature(organizationId, featureKey, enabled, context) {
    try {
      const result = enabled
        ? await this.tenantFeaturesRepository.enableFeature(
            organizationId,
            featureKey,
            context.userId
          )
        : await this.tenantFeaturesRepository.disableFeature(
            organizationId,
            featureKey,
            context.userId
          );

      logger.logBusiness('feature_toggled', {
        organizationId,
        featureKey,
        enabled,
        userId: context.userId
      });

      return result;
    } catch (error) {
      logger.error('TenantService.toggleFeature error:', error);
      throw error;
    }
  }

  // ==========================================
  // Validation Helpers
  // ==========================================

  /**
   * Validate custom field data
   * @param {Object} data - Custom field data
   */
  validateCustomFieldData(data) {
    const errors = [];

    if (!data.field_name || !/^[a-z_][a-z0-9_]*$/.test(data.field_name)) {
      errors.push({
        field: 'field_name',
        message: 'Field name must be lowercase with underscores only'
      });
    }

    if (!data.field_label) {
      errors.push({ field: 'field_label', message: 'Field label is required' });
    }

    const validTypes = ['text', 'number', 'date', 'select', 'multi_select', 'boolean', 'file'];
    if (!validTypes.includes(data.field_type)) {
      errors.push({ field: 'field_type', message: 'Invalid field type' });
    }

    if (['select', 'multi_select'].includes(data.field_type) && !data.field_options) {
      errors.push({
        field: 'field_options',
        message: 'Field options required for select types'
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Custom field validation failed', errors);
    }
  }

  /**
   * Validate custom field values
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {Object} fieldValues - Field values to validate
   */
  async validateCustomFieldValues(organizationId, entityType, fieldValues) {
    const fields = await this.customFieldsRepository.getEntityCustomFields(
      organizationId,
      entityType
    );

    const errors = [];

    for (const field of fields) {
      const value = fieldValues[field.field_name];

      // Check required fields
      if (field.is_required && (value === null || value === undefined || value === '')) {
        errors.push({
          field: field.field_name,
          message: `${field.field_label} is required`
        });
      }

      // Validate field type
      if (value !== null && value !== undefined) {
        const validationError = this.validateFieldValue(field, value);
        if (validationError) {
          errors.push(validationError);
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Custom field values validation failed', errors);
    }
  }

  /**
   * Validate single field value
   * @param {Object} field - Field definition
   * @param {*} value - Field value
   * @returns {Object|null} Error or null
   */
  validateFieldValue(field, value) {
    switch (field.field_type) {
      case 'number':
        if (isNaN(value)) {
          return { field: field.field_name, message: 'Must be a number' };
        }
        break;

      case 'date':
        if (isNaN(Date.parse(value))) {
          return { field: field.field_name, message: 'Must be a valid date' };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return { field: field.field_name, message: 'Must be true or false' };
        }
        break;

      case 'select':
        const options = field.field_options?.options || [];
        if (!options.includes(value)) {
          return { field: field.field_name, message: 'Invalid option selected' };
        }
        break;
    }

    return null;
  }

  /**
   * Infer data type from value
   * @param {*} value - Value
   * @returns {String} Data type
   */
  inferDataType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
      if (!isNaN(Date.parse(value))) return 'date';
      return 'string';
    }
    return 'json';
  }
}

module.exports = TenantService;
