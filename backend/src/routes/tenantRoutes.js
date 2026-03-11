/**
 * Tenant Routes
 *
 * API endpoints for tenant customization, settings, and features
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize tenant routes with dependencies
 * @param {Object} tenantController - Tenant controller instance
 * @param {Object} authMiddleware - Authentication middleware
 * @param {Object} tenantMiddleware - Tenant middleware
 * @param {Object} permissionMiddleware - Permission middleware
 * @returns {Router} Express router
 */
function createTenantRoutes(
  tenantController,
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware
) {
  // Apply authentication and tenant resolution to all routes
  router.use(authMiddleware.authenticate);
  router.use(tenantMiddleware.resolveTenant);
  router.use(tenantMiddleware.requireTenant);

  // ==========================================
  // Settings Routes
  // ==========================================

  /**
   * @route   GET /api/tenant/settings
   * @desc    Get all settings for organization
   * @access  Admin
   */
  router.get(
    '/settings',
    permissionMiddleware.hasRole('admin'),
    tenantController.getSettings.bind(tenantController)
  );

  /**
   * @route   GET /api/tenant/settings/:category
   * @desc    Get settings by category
   * @access  Admin
   */
  router.get(
    '/settings/:category',
    permissionMiddleware.hasRole('admin'),
    tenantController.getSettingsByCategory.bind(tenantController)
  );

  /**
   * @route   PUT /api/tenant/settings/:category/:key
   * @desc    Update specific setting
   * @access  Admin
   */
  router.put(
    '/settings/:category/:key',
    permissionMiddleware.hasRole('admin'),
    tenantController.updateSetting.bind(tenantController)
  );

  /**
   * @route   POST /api/tenant/settings/bulk
   * @desc    Bulk update settings
   * @access  Admin
   */
  router.post(
    '/settings/bulk',
    permissionMiddleware.hasRole('admin'),
    tenantController.bulkUpdateSettings.bind(tenantController)
  );

  // ==========================================
  // Custom Fields Routes
  // ==========================================

  /**
   * @route   GET /api/tenant/custom-fields/:entityType
   * @desc    Get custom fields for entity type
   * @access  Admin, HR
   */
  router.get(
    '/custom-fields/:entityType',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    tenantController.getCustomFields.bind(tenantController)
  );

  /**
   * @route   POST /api/tenant/custom-fields
   * @desc    Create custom field
   * @access  Admin
   */
  router.post(
    '/custom-fields',
    permissionMiddleware.hasRole('admin'),
    tenantController.createCustomField.bind(tenantController)
  );

  /**
   * @route   PUT /api/tenant/custom-fields/:id
   * @desc    Update custom field
   * @access  Admin
   */
  router.put(
    '/custom-fields/:id',
    permissionMiddleware.hasRole('admin'),
    tenantController.updateCustomField.bind(tenantController)
  );

  /**
   * @route   DELETE /api/tenant/custom-fields/:id
   * @desc    Delete custom field
   * @access  Admin
   */
  router.delete(
    '/custom-fields/:id',
    permissionMiddleware.hasRole('admin'),
    tenantController.deleteCustomField.bind(tenantController)
  );

  /**
   * @route   GET /api/tenant/custom-fields/:entityType/:entityId/values
   * @desc    Get custom field values for entity
   * @access  Admin, HR, Manager
   */
  router.get(
    '/custom-fields/:entityType/:entityId/values',
    permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager']),
    tenantController.getEntityCustomFieldValues.bind(tenantController)
  );

  /**
   * @route   POST /api/tenant/custom-fields/:entityType/:entityId/values
   * @desc    Set custom field values for entity
   * @access  Admin, HR
   */
  router.post(
    '/custom-fields/:entityType/:entityId/values',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    tenantController.setEntityCustomFieldValues.bind(tenantController)
  );

  // ==========================================
  // Features Routes
  // ==========================================

  /**
   * @route   GET /api/tenant/features
   * @desc    Get all features for organization
   * @access  Admin
   */
  router.get(
    '/features',
    permissionMiddleware.hasRole('admin'),
    tenantController.getFeatures.bind(tenantController)
  );

  /**
   * @route   GET /api/tenant/features/:featureKey/enabled
   * @desc    Check if feature is enabled
   * @access  Authenticated users
   */
  router.get(
    '/features/:featureKey/enabled',
    tenantController.isFeatureEnabled.bind(tenantController)
  );

  /**
   * @route   POST /api/tenant/features/:featureKey/toggle
   * @desc    Toggle feature on/off
   * @access  Admin
   */
  router.post(
    '/features/:featureKey/toggle',
    permissionMiddleware.hasRole('admin'),
    tenantController.toggleFeature.bind(tenantController)
  );

  // ==========================================
  // Configuration Routes
  // ==========================================

  /**
   * @route   GET /api/tenant/config
   * @desc    Get complete tenant configuration
   * @access  Authenticated users
   */
  router.get(
    '/config',
    tenantController.getTenantConfig.bind(tenantController)
  );

  return router;
}

module.exports = createTenantRoutes;
