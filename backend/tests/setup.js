/**
 * Test Setup
 *
 * Configures test environment for unit and integration tests
 */

const { Pool } = require('pg');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Test database connection
const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
});

// Global test utilities
global.testHelpers = {
  pool: testPool,

  /**
   * Clean database before tests
   */
  async cleanDatabase() {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');

      // Delete test data (in correct order due to FK constraints)
      await client.query('DELETE FROM grxbooks.custom_field_values WHERE organization_id LIKE \'test-%\'');
      await client.query('DELETE FROM grxbooks.custom_fields WHERE organization_id LIKE \'test-%\'');
      await client.query('DELETE FROM grxbooks.tenant_settings WHERE organization_id LIKE \'test-%\'');
      await client.query('DELETE FROM grxbooks.user_roles WHERE organization_id LIKE \'test-%\'');
      await client.query('DELETE FROM grxbooks.profiles WHERE organization_id LIKE \'test-%\'');
      await client.query('DELETE FROM grxbooks.organizations WHERE id LIKE \'test-%\'');

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create test organization
   */
  async createTestOrganization(data = {}) {
    const id = data.id || `test-org-${Date.now()}`;
    const result = await testPool.query(
      `INSERT INTO grxbooks.organizations (id, name, subdomain, status, subscription_tier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        data.name || 'Test Organization',
        data.subdomain || `test-${Date.now()}`,
        data.status || 'active',
        data.subscription_tier || 'pro'
      ]
    );
    return result.rows[0];
  },

  /**
   * Create test user
   */
  async createTestUser(organizationId, data = {}) {
    const id = data.id || `test-user-${Date.now()}`;
    const result = await testPool.query(
      `INSERT INTO grxbooks.profiles (id, organization_id, full_name, email, ms365_email, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        organizationId,
        data.full_name || 'Test User',
        data.email || `test-${Date.now()}@example.com`,
        data.ms365_email || `test-${Date.now()}@company.com`,
        data.status || 'active'
      ]
    );
    return result.rows[0];
  },

  /**
   * Create test user role
   */
  async createTestUserRole(userId, organizationId, role = 'admin') {
    const result = await testPool.query(
      `INSERT INTO grxbooks.user_roles (user_id, organization_id, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, organizationId, role]
    );
    return result.rows[0];
  },

  /**
   * Generate mock request object
   */
  mockRequest(data = {}) {
    return {
      body: data.body || {},
      query: data.query || {},
      params: data.params || {},
      headers: data.headers || {},
      user: data.user || null,
      tenant: data.tenant || null,
      get: (header) => data.headers?.[header.toLowerCase()] || null
    };
  },

  /**
   * Generate mock response object
   */
  mockResponse() {
    const res = {
      statusCode: 200,
      data: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.data = data;
        return this;
      },
      send: function(data) {
        this.data = data;
        return this;
      },
      setHeader: jest.fn(),
      removeHeader: jest.fn()
    };
    return res;
  },

  /**
   * Generate mock next function
   */
  mockNext() {
    return jest.fn();
  }
};

// Cleanup after all tests
afterAll(async () => {
  await testHelpers.cleanDatabase();
  await testPool.end();
});
