/**
 * Employee Repository
 *
 * Data access layer for employees
 * Extends BaseRepository for common CRUD operations
 */

const BaseRepository = require('../core/BaseRepository');
const logger = require('../utils/logger');

class EmployeeRepository extends BaseRepository {
  constructor(pool) {
    super('profiles', pool); // Table name is 'profiles' in grxbooks schema
  }

  /**
   * Find employees by organization
   * @param {String} organizationId - Organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Results with total count
   */
  async findByOrganization(organizationId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        status = null,
        department = null,
        search = null
      } = options;

      const fullTable = this.getFullTableName();
      const conditions = ['organization_id = $1', 'deleted_at IS NULL'];
      const values = [organizationId];
      let paramIndex = 2;

      // Add status filter
      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      // Add department filter
      if (department) {
        conditions.push(`department = $${paramIndex++}`);
        values.push(department);
      }

      // Add search filter (name, email, employee_id)
      if (search) {
        conditions.push(`(
          full_name ILIKE $${paramIndex} OR
          email ILIKE $${paramIndex} OR
          employee_id ILIKE $${paramIndex}
        )`);
        values.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM ${fullTable} ${whereClause}`;
      const countResult = await this.pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data with role information
      const dataQuery = `
        SELECT
          p.*,
          ur.role as organization_role,
          pr.role as platform_role
        FROM ${fullTable} p
        LEFT JOIN grxbooks.user_roles ur ON p.id = ur.user_id AND ur.organization_id = p.organization_id
        LEFT JOIN grxbooks.platform_roles pr ON p.id = pr.user_id
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1}
      `;
      const dataResult = await this.pool.query(dataQuery, [...values, limit, offset]);

      return {
        rows: dataResult.rows,
        total
      };
    } catch (error) {
      logger.error('EmployeeRepository.findByOrganization error:', error);
      throw error;
    }
  }

  /**
   * Find employee by email
   * @param {String} email - Employee email
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Employee or null
   */
  async findByEmail(email, organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT
          p.*,
          ur.role as organization_role,
          pr.role as platform_role
        FROM ${fullTable} p
        LEFT JOIN grxbooks.user_roles ur ON p.id = ur.user_id AND ur.organization_id = p.organization_id
        LEFT JOIN grxbooks.platform_roles pr ON p.id = pr.user_id
        WHERE p.email = $1
        AND p.organization_id = $2
        AND p.deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [email, organizationId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('EmployeeRepository.findByEmail error:', error);
      throw error;
    }
  }

  /**
   * Find employee by employee ID
   * @param {String} employeeId - Employee ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Employee or null
   */
  async findByEmployeeId(employeeId, organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT
          p.*,
          ur.role as organization_role,
          pr.role as platform_role
        FROM ${fullTable} p
        LEFT JOIN grxbooks.user_roles ur ON p.id = ur.user_id AND ur.organization_id = p.organization_id
        LEFT JOIN grxbooks.platform_roles pr ON p.id = pr.user_id
        WHERE p.employee_id = $1
        AND p.organization_id = $2
        AND p.deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [employeeId, organizationId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('EmployeeRepository.findByEmployeeId error:', error);
      throw error;
    }
  }

  /**
   * Get employee statistics for organization
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(organizationId) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT
          COUNT(*) as total_employees,
          COUNT(*) FILTER (WHERE status = 'active') as active_employees,
          COUNT(*) FILTER (WHERE status = 'inactive') as inactive_employees,
          COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave_employees,
          COUNT(DISTINCT department) as total_departments,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_hires_30_days
        FROM ${fullTable}
        WHERE organization_id = $1
        AND deleted_at IS NULL
      `;

      const result = await this.pool.query(query, [organizationId]);
      return result.rows[0];
    } catch (error) {
      logger.error('EmployeeRepository.getStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get employees by department
   * @param {String} organizationId - Organization ID
   * @param {String} department - Department name
   * @returns {Promise<Array>} Employees
   */
  async findByDepartment(organizationId, department) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        SELECT
          p.*,
          ur.role as organization_role
        FROM ${fullTable} p
        LEFT JOIN grxbooks.user_roles ur ON p.id = ur.user_id AND ur.organization_id = p.organization_id
        WHERE p.organization_id = $1
        AND p.department = $2
        AND p.deleted_at IS NULL
        ORDER BY p.full_name ASC
      `;

      const result = await this.pool.query(query, [organizationId, department]);
      return result.rows;
    } catch (error) {
      logger.error('EmployeeRepository.findByDepartment error:', error);
      throw error;
    }
  }

  /**
   * Update employee status
   * @param {String} id - Employee ID
   * @param {String} status - New status
   * @param {String} updatedBy - User ID who updated
   * @returns {Promise<Object>} Updated employee
   */
  async updateStatus(id, status, updatedBy) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        UPDATE ${fullTable}
        SET
          status = $1,
          updated_by = $2,
          updated_at = NOW()
        WHERE id = $3
        AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.pool.query(query, [status, updatedBy, id]);
      return result.rows[0];
    } catch (error) {
      logger.error('EmployeeRepository.updateStatus error:', error);
      throw error;
    }
  }

  /**
   * Check if email exists in organization
   * @param {String} email - Email to check
   * @param {String} organizationId - Organization ID
   * @param {String} excludeId - ID to exclude from check
   * @returns {Promise<Boolean>} Exists status
   */
  async emailExists(email, organizationId, excludeId = null) {
    try {
      const fullTable = this.getFullTableName();

      let query = `
        SELECT COUNT(*) as count
        FROM ${fullTable}
        WHERE email = $1
        AND organization_id = $2
        AND deleted_at IS NULL
      `;

      const values = [email, organizationId];

      if (excludeId) {
        query += ' AND id != $3';
        values.push(excludeId);
      }

      const result = await this.pool.query(query, values);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('EmployeeRepository.emailExists error:', error);
      throw error;
    }
  }
}

module.exports = EmployeeRepository;
