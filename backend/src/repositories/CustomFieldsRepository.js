/**
 * Custom Fields Repository
 *
 * Data access layer for custom field definitions and values
 */

const BaseRepository = require('../core/BaseRepository');
const logger = require('../utils/logger');

class CustomFieldsRepository extends BaseRepository {
  constructor(pool) {
    super('custom_fields', pool);
  }

  /**
   * Get custom fields for entity type
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @returns {Promise<Array>} Custom fields
   */
  async getEntityCustomFields(organizationId, entityType) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT *
        FROM ${fullTable}
        WHERE organization_id = $1
        AND entity_type = $2
        AND is_active = true
        AND deleted_at IS NULL
        ORDER BY display_order, field_label
      `;

      const result = await this.pool.query(query, [organizationId, entityType]);
      return result.rows;
    } catch (error) {
      logger.error('CustomFieldsRepository.getEntityCustomFields error:', error);
      throw error;
    }
  }

  /**
   * Get custom field by ID
   * @param {String} id - Custom field ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Custom field or null
   */
  async getCustomFieldById(id, organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT *
        FROM ${fullTable}
        WHERE id = $1
        AND organization_id = $2
        AND deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [id, organizationId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('CustomFieldsRepository.getCustomFieldById error:', error);
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
      const query = `
        SELECT
          cf.id,
          cf.field_name,
          cf.field_label,
          cf.field_type,
          cf.field_options,
          cf.default_value,
          cf.is_required,
          cf.help_text,
          COALESCE(cfv.field_value, cf.default_value) as field_value
        FROM grxbooks.custom_fields cf
        LEFT JOIN grxbooks.custom_field_values cfv
          ON cf.id = cfv.custom_field_id
          AND cfv.entity_id = $3
        WHERE cf.organization_id = $1
        AND cf.entity_type = $2
        AND cf.is_active = true
        AND cf.deleted_at IS NULL
        ORDER BY cf.display_order, cf.field_label
      `;

      const result = await this.pool.query(query, [organizationId, entityType, entityId]);
      return result.rows;
    } catch (error) {
      logger.error('CustomFieldsRepository.getEntityCustomFieldValues error:', error);
      throw error;
    }
  }

  /**
   * Set custom field value
   * @param {Object} data - Custom field value data
   * @returns {Promise<Object>} Custom field value
   */
  async setCustomFieldValue(data) {
    try {
      const query = `
        INSERT INTO grxbooks.custom_field_values (
          organization_id,
          custom_field_id,
          entity_type,
          entity_id,
          field_value,
          created_by,
          updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (custom_field_id, entity_id)
        DO UPDATE SET
          field_value = $5,
          updated_by = $7,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        data.organization_id,
        data.custom_field_id,
        data.entity_type,
        data.entity_id,
        data.field_value,
        data.created_by,
        data.updated_by
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('CustomFieldsRepository.setCustomFieldValue error:', error);
      throw error;
    }
  }

  /**
   * Bulk set custom field values
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {String} entityId - Entity ID
   * @param {Object} fieldValues - Object with field_name: value pairs
   * @param {String} userId - User ID
   * @returns {Promise<Array>} Set values
   */
  async bulkSetCustomFieldValues(organizationId, entityType, entityId, fieldValues, userId) {
    try {
      // Get field definitions
      const fields = await this.getEntityCustomFields(organizationId, entityType);

      const results = [];

      for (const field of fields) {
        if (fieldValues.hasOwnProperty(field.field_name)) {
          const value = fieldValues[field.field_name];

          const result = await this.setCustomFieldValue({
            organization_id: organizationId,
            custom_field_id: field.id,
            entity_type: entityType,
            entity_id: entityId,
            field_value: value,
            created_by: userId,
            updated_by: userId
          });

          results.push(result);
        }
      }

      return results;
    } catch (error) {
      logger.error('CustomFieldsRepository.bulkSetCustomFieldValues error:', error);
      throw error;
    }
  }

  /**
   * Search entities by custom field value
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {String} fieldName - Field name
   * @param {*} searchValue - Value to search for
   * @returns {Promise<Array>} Entity IDs
   */
  async searchByCustomFieldValue(organizationId, entityType, fieldName, searchValue) {
    try {
      const query = `
        SELECT DISTINCT cfv.entity_id
        FROM grxbooks.custom_field_values cfv
        JOIN grxbooks.custom_fields cf ON cfv.custom_field_id = cf.id
        WHERE cfv.organization_id = $1
        AND cfv.entity_type = $2
        AND cf.field_name = $3
        AND cfv.field_value @> $4::jsonb
      `;

      const result = await this.pool.query(query, [
        organizationId,
        entityType,
        fieldName,
        JSON.stringify(searchValue)
      ]);

      return result.rows.map(row => row.entity_id);
    } catch (error) {
      logger.error('CustomFieldsRepository.searchByCustomFieldValue error:', error);
      throw error;
    }
  }

  /**
   * Check if field name exists
   * @param {String} organizationId - Organization ID
   * @param {String} entityType - Entity type
   * @param {String} fieldName - Field name
   * @param {String} excludeId - ID to exclude
   * @returns {Promise<Boolean>} Exists
   */
  async fieldNameExists(organizationId, entityType, fieldName, excludeId = null) {
    try {
      const fullTable = this.getFullTableName();

      let query = `
        SELECT COUNT(*) as count
        FROM ${fullTable}
        WHERE organization_id = $1
        AND entity_type = $2
        AND field_name = $3
        AND deleted_at IS NULL
      `;

      const values = [organizationId, entityType, fieldName];

      if (excludeId) {
        query += ' AND id != $4';
        values.push(excludeId);
      }

      const result = await this.pool.query(query, values);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('CustomFieldsRepository.fieldNameExists error:', error);
      throw error;
    }
  }

  /**
   * Delete custom field values for entity
   * @param {String} organizationId - Organization ID
   * @param {String} entityId - Entity ID
   * @returns {Promise<Boolean>} Success
   */
  async deleteEntityCustomFieldValues(organizationId, entityId) {
    try {
      const query = `
        DELETE FROM grxbooks.custom_field_values
        WHERE organization_id = $1
        AND entity_id = $2
        RETURNING id
      `;

      const result = await this.pool.query(query, [organizationId, entityId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('CustomFieldsRepository.deleteEntityCustomFieldValues error:', error);
      throw error;
    }
  }
}

module.exports = CustomFieldsRepository;
