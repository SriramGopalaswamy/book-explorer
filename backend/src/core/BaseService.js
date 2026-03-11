/**
 * Base Service
 *
 * All services should extend this base class.
 * Contains business logic and orchestrates repositories.
 * NO database queries here - use repositories instead.
 */

const { AppError, NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class BaseService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Find all records with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated results
   */
  async findAll(options = {}) {
    try {
      const { page = 1, limit = 20, sortBy, sortOrder, filters = {} } = options;

      const result = await this.repository.findAll({
        limit,
        offset: (page - 1) * limit,
        sortBy,
        sortOrder,
        where: filters
      });

      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      };
    } catch (error) {
      logger.error('Service findAll error:', error);
      throw error;
    }
  }

  /**
   * Find record by ID
   * @param {String} id - Record ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Record
   */
  async findById(id, options = {}) {
    try {
      const record = await this.repository.findById(id, options);

      if (!record) {
        throw new NotFoundError(`Record not found with id: ${id}`);
      }

      return record;
    } catch (error) {
      logger.error('Service findById error:', error);
      throw error;
    }
  }

  /**
   * Find one record by criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Record
   */
  async findOne(criteria, options = {}) {
    try {
      const record = await this.repository.findOne(criteria, options);

      if (!record && options.throwIfNotFound) {
        throw new NotFoundError('Record not found');
      }

      return record;
    } catch (error) {
      logger.error('Service findOne error:', error);
      throw error;
    }
  }

  /**
   * Create new record
   * @param {Object} data - Record data
   * @param {Object} context - User/tenant context
   * @returns {Promise<Object>} Created record
   */
  async create(data, context = {}) {
    try {
      // Validate data
      this.validateCreateData(data);

      // Add audit fields
      const enrichedData = {
        ...data,
        created_by: context.userId,
        organization_id: context.tenantId,
        created_at: new Date()
      };

      const record = await this.repository.create(enrichedData);

      // Log audit trail
      if (context.auditLog) {
        await this.logAudit('CREATE', record.id, context);
      }

      return record;
    } catch (error) {
      logger.error('Service create error:', error);
      throw error;
    }
  }

  /**
   * Update record
   * @param {String} id - Record ID
   * @param {Object} data - Update data
   * @param {Object} context - User/tenant context
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data, context = {}) {
    try {
      // Check if record exists
      const existing = await this.findById(id);

      // Validate update data
      this.validateUpdateData(data);

      // Add audit fields
      const enrichedData = {
        ...data,
        updated_by: context.userId,
        updated_at: new Date()
      };

      const record = await this.repository.update(id, enrichedData);

      // Log audit trail
      if (context.auditLog) {
        await this.logAudit('UPDATE', record.id, context, { before: existing, after: record });
      }

      return record;
    } catch (error) {
      logger.error('Service update error:', error);
      throw error;
    }
  }

  /**
   * Delete record (soft delete)
   * @param {String} id - Record ID
   * @param {Object} context - User/tenant context
   * @returns {Promise<Boolean>} Success status
   */
  async delete(id, context = {}) {
    try {
      // Check if record exists
      await this.findById(id);

      // Soft delete
      const result = await this.repository.softDelete(id, context.userId);

      // Log audit trail
      if (context.auditLog) {
        await this.logAudit('DELETE', id, context);
      }

      return result;
    } catch (error) {
      logger.error('Service delete error:', error);
      throw error;
    }
  }

  /**
   * Permanently delete record
   * @param {String} id - Record ID
   * @param {Object} context - User/tenant context
   * @returns {Promise<Boolean>} Success status
   */
  async hardDelete(id, context = {}) {
    try {
      // Check if record exists
      await this.findById(id);

      const result = await this.repository.hardDelete(id);

      // Log audit trail
      if (context.auditLog) {
        await this.logAudit('HARD_DELETE', id, context);
      }

      return result;
    } catch (error) {
      logger.error('Service hardDelete error:', error);
      throw error;
    }
  }

  /**
   * Count records
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Number>} Count
   */
  async count(filters = {}) {
    try {
      return await this.repository.count(filters);
    } catch (error) {
      logger.error('Service count error:', error);
      throw error;
    }
  }

  /**
   * Check if record exists
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Boolean>} Exists status
   */
  async exists(criteria) {
    try {
      return await this.repository.exists(criteria);
    } catch (error) {
      logger.error('Service exists error:', error);
      throw error;
    }
  }

  /**
   * Validate create data (override in subclass)
   * @param {Object} data - Data to validate
   */
  validateCreateData(data) {
    // Override in subclass
  }

  /**
   * Validate update data (override in subclass)
   * @param {Object} data - Data to validate
   */
  validateUpdateData(data) {
    // Override in subclass
  }

  /**
   * Log audit trail
   * @param {String} action - Action type
   * @param {String} entityId - Entity ID
   * @param {Object} context - User/tenant context
   * @param {Object} details - Additional details
   */
  async logAudit(action, entityId, context, details = {}) {
    try {
      // Implementation in AuditService
      logger.info('Audit log:', {
        action,
        entityId,
        userId: context.userId,
        tenantId: context.tenantId,
        details
      });
    } catch (error) {
      // Don't throw - audit logging failure shouldn't break the operation
      logger.error('Audit logging failed:', error);
    }
  }

  /**
   * Execute in transaction
   * @param {Function} callback - Transaction callback
   * @returns {Promise<*>} Transaction result
   */
  async transaction(callback) {
    return await this.repository.transaction(callback);
  }
}

module.exports = BaseService;
