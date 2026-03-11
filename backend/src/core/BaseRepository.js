/**
 * Base Repository
 *
 * All repositories should extend this base class.
 * Handles all database queries and data access.
 * This is the ONLY layer that talks to the database.
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

class BaseRepository {
  constructor(tableName, pool) {
    this.tableName = tableName;
    this.pool = pool;
    this.schema = 'grxbooks';
  }

  /**
   * Get full table name with schema
   * @returns {String} Full table name
   */
  getFullTableName() {
    return `${this.schema}.${this.tableName}`;
  }

  /**
   * Find all records
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Results with total count
   */
  async findAll(options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        where = {},
        select = '*'
      } = options;

      const { whereClause, values } = this.buildWhereClause(where);
      const fullTable = this.getFullTableName();

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM ${fullTable} ${whereClause}`;
      const countResult = await this.pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      const dataQuery = `
        SELECT ${select}
        FROM ${fullTable}
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
      `;
      const dataResult = await this.pool.query(dataQuery, [...values, limit, offset]);

      return {
        rows: dataResult.rows,
        total
      };
    } catch (error) {
      logger.error(`Repository findAll error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find record by ID
   * @param {String} id - Record ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Record or null
   */
  async findById(id, options = {}) {
    try {
      const { select = '*', includeDeleted = false } = options;
      const fullTable = this.getFullTableName();

      const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';

      const query = `
        SELECT ${select}
        FROM ${fullTable}
        WHERE id = $1 ${deletedClause}
        LIMIT 1
      `;

      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Repository findById error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find one record by criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Record or null
   */
  async findOne(criteria, options = {}) {
    try {
      const { select = '*' } = options;
      const { whereClause, values } = this.buildWhereClause(criteria);
      const fullTable = this.getFullTableName();

      const query = `
        SELECT ${select}
        FROM ${fullTable}
        ${whereClause}
        LIMIT 1
      `;

      const result = await this.pool.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Repository findOne error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create new record
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Created record
   */
  async create(data) {
    try {
      const fullTable = this.getFullTableName();
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `
        INSERT INTO ${fullTable} (${columns.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`Repository create error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update record
   * @param {String} id - Record ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data) {
    try {
      const fullTable = this.getFullTableName();
      const columns = Object.keys(data);
      const values = Object.values(data);
      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

      const query = `
        UPDATE ${fullTable}
        SET ${setClause}
        WHERE id = $${columns.length + 1}
        AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.pool.query(query, [...values, id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Repository update error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete record
   * @param {String} id - Record ID
   * @param {String} deletedBy - User ID who deleted
   * @returns {Promise<Boolean>} Success status
   */
  async softDelete(id, deletedBy = null) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        UPDATE ${fullTable}
        SET deleted_at = NOW(),
            deleted_by = $2
        WHERE id = $1
        AND deleted_at IS NULL
        RETURNING id
      `;

      const result = await this.pool.query(query, [id, deletedBy]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Repository softDelete error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Hard delete record
   * @param {String} id - Record ID
   * @returns {Promise<Boolean>} Success status
   */
  async hardDelete(id) {
    try {
      const fullTable = this.getFullTableName();

      const query = `
        DELETE FROM ${fullTable}
        WHERE id = $1
        RETURNING id
      `;

      const result = await this.pool.query(query, [id]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Repository hardDelete error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count records
   * @param {Object} where - Filter criteria
   * @returns {Promise<Number>} Count
   */
  async count(where = {}) {
    try {
      const { whereClause, values } = this.buildWhereClause(where);
      const fullTable = this.getFullTableName();

      const query = `
        SELECT COUNT(*) as count
        FROM ${fullTable}
        ${whereClause}
      `;

      const result = await this.pool.query(query, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Repository count error for ${this.tableName}:`, error);
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
      const count = await this.count(criteria);
      return count > 0;
    } catch (error) {
      logger.error(`Repository exists error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Build WHERE clause from criteria
   * @param {Object} criteria - Filter criteria
   * @returns {Object} Where clause and values
   */
  buildWhereClause(criteria) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    // Always exclude soft-deleted records by default
    if (criteria.includeDeleted !== true) {
      conditions.push('deleted_at IS NULL');
    }
    delete criteria.includeDeleted;

    Object.entries(criteria).forEach(([key, value]) => {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        // IN clause
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        // Complex operators (>, <, >=, <=, LIKE, etc.)
        conditions.push(`${key} ${value.operator} $${paramIndex++}`);
        values.push(value.value);
      } else {
        // Simple equality
        conditions.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, values };
  }

  /**
   * Execute raw query
   * @param {String} query - SQL query
   * @param {Array} values - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, values = []) {
    try {
      return await this.pool.query(query, values);
    } catch (error) {
      logger.error(`Repository executeQuery error for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute in transaction
   * @param {Function} callback - Transaction callback
   * @returns {Promise<*>} Transaction result
   */
  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Repository transaction error for ${this.tableName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BaseRepository;
