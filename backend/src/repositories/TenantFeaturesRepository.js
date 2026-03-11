/**
 * Tenant Features Repository
 *
 * Data access layer for feature flags per organization
 */

const BaseRepository = require('../core/BaseRepository');
const logger = require('../utils/logger');

class TenantFeaturesRepository extends BaseRepository {
  constructor(pool) {
    super('tenant_features', pool);
  }

  /**
   * Get all features for organization
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Array>} Features
   */
  async getOrganizationFeatures(organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT *
        FROM ${fullTable}
        WHERE organization_id = $1
        ORDER BY feature_name
      `;

      const result = await this.pool.query(query, [organizationId]);
      return result.rows;
    } catch (error) {
      logger.error('TenantFeaturesRepository.getOrganizationFeatures error:', error);
      throw error;
    }
  }

  /**
   * Get enabled features only
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Array>} Enabled features
   */
  async getEnabledFeatures(organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT *
        FROM ${fullTable}
        WHERE organization_id = $1
        AND is_enabled = true
        ORDER BY feature_name
      `;

      const result = await this.pool.query(query, [organizationId]);
      return result.rows;
    } catch (error) {
      logger.error('TenantFeaturesRepository.getEnabledFeatures error:', error);
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
      const fullTable = this.getFullTableName();

      const query = `
        SELECT is_enabled
        FROM ${fullTable}
        WHERE organization_id = $1
        AND feature_key = $2
        LIMIT 1
      `;

      const result = await this.pool.query(query, [organizationId, featureKey]);
      return result.rows[0]?.is_enabled || false;
    } catch (error) {
      logger.error('TenantFeaturesRepository.isFeatureEnabled error:', error);
      throw error;
    }
  }

  /**
   * Enable feature
   * @param {String} organizationId - Organization ID
   * @param {String} featureKey - Feature key
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Feature
   */
  async enableFeature(organizationId, featureKey, userId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        UPDATE ${fullTable}
        SET
          is_enabled = true,
          enabled_at = NOW(),
          enabled_by = $3,
          updated_at = NOW()
        WHERE organization_id = $1
        AND feature_key = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, [organizationId, featureKey, userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('TenantFeaturesRepository.enableFeature error:', error);
      throw error;
    }
  }

  /**
   * Disable feature
   * @param {String} organizationId - Organization ID
   * @param {String} featureKey - Feature key
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Feature
   */
  async disableFeature(organizationId, featureKey, userId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        UPDATE ${fullTable}
        SET
          is_enabled = false,
          disabled_at = NOW(),
          disabled_by = $3,
          updated_at = NOW()
        WHERE organization_id = $1
        AND feature_key = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, [organizationId, featureKey, userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('TenantFeaturesRepository.disableFeature error:', error);
      throw error;
    }
  }

  /**
   * Update feature configuration
   * @param {String} organizationId - Organization ID
   * @param {String} featureKey - Feature key
   * @param {Object} configuration - Configuration object
   * @returns {Promise<Object>} Feature
   */
  async updateFeatureConfiguration(organizationId, featureKey, configuration) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        UPDATE ${fullTable}
        SET
          configuration = $3,
          updated_at = NOW()
        WHERE organization_id = $1
        AND feature_key = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        organizationId,
        featureKey,
        JSON.stringify(configuration)
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('TenantFeaturesRepository.updateFeatureConfiguration error:', error);
      throw error;
    }
  }

  /**
   * Get features by tier restriction
   * @param {String} tier - Subscription tier
   * @returns {Promise<Array>} Features
   */
  async getFeaturesByTier(tier) {
    try {
      const fullTable = this.getFullTableName();

      const tierHierarchy = {
        free: ['free'],
        basic: ['free', 'basic'],
        pro: ['free', 'basic', 'pro'],
        enterprise: ['free', 'basic', 'pro', 'enterprise']
      };

      const allowedTiers = tierHierarchy[tier] || ['free'];

      const query = `
        SELECT DISTINCT feature_key, feature_name, tier_restriction
        FROM ${fullTable}
        WHERE tier_restriction = ANY($1)
        ORDER BY feature_name
      `;

      const result = await this.pool.query(query, [allowedTiers]);
      return result.rows;
    } catch (error) {
      logger.error('TenantFeaturesRepository.getFeaturesByTier error:', error);
      throw error;
    }
  }
}

module.exports = TenantFeaturesRepository;
