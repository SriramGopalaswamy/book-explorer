/**
 * Tenant Settings Repository
 *
 * Data access layer for organization-specific settings
 */

const BaseRepository = require('../core/BaseRepository');
const logger = require('../utils/logger');

class TenantSettingsRepository extends BaseRepository {
  constructor(pool) {
    super('tenant_settings', pool);
  }

  /**
   * Get all settings for organization
   * @param {String} organizationId - Organization ID
   * @param {String} category - Optional category filter
   * @returns {Promise<Array>} Settings
   */
  async getOrganizationSettings(organizationId, category = null) {
    try {
      const fullTable = this.getFullTableName();
      let query = `
        SELECT *
        FROM ${fullTable}
        WHERE organization_id = $1
      `;

      const values = [organizationId];

      if (category) {
        query += ' AND category = $2';
        values.push(category);
      }

      query += ' ORDER BY category, setting_key';

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('TenantSettingsRepository.getOrganizationSettings error:', error);
      throw error;
    }
  }

  /**
   * Get specific setting
   * @param {String} organizationId - Organization ID
   * @param {String} category - Setting category
   * @param {String} key - Setting key
   * @returns {Promise<Object>} Setting or null
   */
  async getSetting(organizationId, category, key) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT *
        FROM ${fullTable}
        WHERE organization_id = $1
        AND category = $2
        AND setting_key = $3
        LIMIT 1
      `;

      const result = await this.pool.query(query, [organizationId, category, key]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('TenantSettingsRepository.getSetting error:', error);
      throw error;
    }
  }

  /**
   * Upsert setting (create or update)
   * @param {Object} data - Setting data
   * @returns {Promise<Object>} Setting
   */
  async upsertSetting(data) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        INSERT INTO ${fullTable} (
          organization_id,
          category,
          setting_key,
          setting_value,
          data_type,
          is_encrypted,
          description,
          created_by,
          updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (organization_id, category, setting_key)
        DO UPDATE SET
          setting_value = $4,
          data_type = $5,
          description = $7,
          updated_by = $9,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        data.organization_id,
        data.category,
        data.setting_key,
        data.setting_value,
        data.data_type,
        data.is_encrypted || false,
        data.description,
        data.created_by,
        data.updated_by
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('TenantSettingsRepository.upsertSetting error:', error);
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
      const settings = await this.getOrganizationSettings(organizationId, category);

      const settingsObj = {};
      settings.forEach(setting => {
        settingsObj[setting.setting_key] = setting.setting_value;
      });

      return settingsObj;
    } catch (error) {
      logger.error('TenantSettingsRepository.getSettingsByCategory error:', error);
      throw error;
    }
  }

  /**
   * Delete setting
   * @param {String} organizationId - Organization ID
   * @param {String} category - Category
   * @param {String} key - Setting key
   * @returns {Promise<Boolean>} Success
   */
  async deleteSetting(organizationId, category, key) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        DELETE FROM ${fullTable}
        WHERE organization_id = $1
        AND category = $2
        AND setting_key = $3
        RETURNING id
      `;

      const result = await this.pool.query(query, [organizationId, category, key]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('TenantSettingsRepository.deleteSetting error:', error);
      throw error;
    }
  }

  /**
   * Bulk upsert settings
   * @param {String} organizationId - Organization ID
   * @param {Array} settings - Array of settings
   * @param {String} userId - User ID
   * @returns {Promise<Array>} Created/updated settings
   */
  async bulkUpsertSettings(organizationId, settings, userId) {
    try {
      const results = [];

      for (const setting of settings) {
        const result = await this.upsertSetting({
          organization_id: organizationId,
          category: setting.category,
          setting_key: setting.key,
          setting_value: setting.value,
          data_type: setting.dataType || 'string',
          description: setting.description,
          created_by: userId,
          updated_by: userId
        });
        results.push(result);
      }

      return results;
    } catch (error) {
      logger.error('TenantSettingsRepository.bulkUpsertSettings error:', error);
      throw error;
    }
  }
}

module.exports = TenantSettingsRepository;
