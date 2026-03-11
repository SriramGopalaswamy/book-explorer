/**
 * Employee Controller
 *
 * HTTP layer for employee management endpoints
 * Extends BaseController for common response methods
 */

const BaseController = require('../core/BaseController');
const logger = require('../utils/logger');

class EmployeeController extends BaseController {
  constructor(employeeService) {
    super();
    this.employeeService = employeeService;
  }

  /**
   * Get all employees for organization
   * GET /api/employees
   */
  async getEmployees(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { page, limit } = this.getPaginationParams(req);
      const { sortBy, sortOrder } = this.getSortParams(req);
      const { status, department, search } = req.query;

      const result = await this.employeeService.getOrganizationEmployees(tenant.id, {
        page,
        limit,
        sortBy,
        sortOrder,
        status,
        department,
        search
      });

      return this.paginated(res, result.data, result.pagination);
    })(req, res, next);
  }

  /**
   * Get employee by ID
   * GET /api/employees/:id
   */
  async getEmployee(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;

      const employee = await this.employeeService.getEmployeeById(id, tenant.id);

      return this.success(res, employee, 'Employee retrieved successfully');
    })(req, res, next);
  }

  /**
   * Create new employee
   * POST /api/employees
   */
  async createEmployee(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const employee = await this.employeeService.createEmployee(req.body, context);

      logger.logAudit('CREATE_EMPLOYEE', employee.id, context);

      return this.created(res, employee, 'Employee created successfully');
    })(req, res, next);
  }

  /**
   * Update employee
   * PUT /api/employees/:id
   */
  async updateEmployee(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const employee = await this.employeeService.updateEmployee(id, req.body, context);

      logger.logAudit('UPDATE_EMPLOYEE', employee.id, context);

      return this.success(res, employee, 'Employee updated successfully');
    })(req, res, next);
  }

  /**
   * Delete employee
   * DELETE /api/employees/:id
   */
  async deleteEmployee(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      await this.employeeService.deleteEmployee(id, context);

      logger.logAudit('DELETE_EMPLOYEE', id, context);

      return this.success(res, null, 'Employee deleted successfully');
    })(req, res, next);
  }

  /**
   * Update employee status
   * PATCH /api/employees/:id/status
   */
  async updateEmployeeStatus(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { id } = req.params;
      const { status } = req.body;

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const employee = await this.employeeService.updateEmployeeStatus(id, status, context);

      logger.logAudit('UPDATE_EMPLOYEE_STATUS', id, context, { status });

      return this.success(res, employee, 'Employee status updated successfully');
    })(req, res, next);
  }

  /**
   * Get organization statistics
   * GET /api/employees/statistics
   */
  async getStatistics(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);

      const stats = await this.employeeService.getOrganizationStatistics(tenant.id);

      return this.success(res, stats, 'Statistics retrieved successfully');
    })(req, res, next);
  }

  /**
   * Get employees by department
   * GET /api/employees/department/:department
   */
  async getEmployeesByDepartment(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { department } = req.params;

      const employees = await this.employeeService.getEmployeesByDepartment(tenant.id, department);

      return this.success(res, employees, 'Employees retrieved successfully');
    })(req, res, next);
  }

  /**
   * Bulk import employees
   * POST /api/employees/bulk-import
   */
  async bulkImportEmployees(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const user = this.getCurrentUser(req);
      const tenant = this.getCurrentTenant(req);
      const { employees } = req.body;

      if (!Array.isArray(employees) || employees.length === 0) {
        return this.validationError(res, [
          { field: 'employees', message: 'Employees array is required and must not be empty' }
        ]);
      }

      const context = {
        userId: user.id,
        tenantId: tenant.id,
        auditLog: true
      };

      const results = {
        success: [],
        failed: []
      };

      // Process each employee
      for (const employeeData of employees) {
        try {
          const employee = await this.employeeService.createEmployee(employeeData, context);
          results.success.push({ employee, data: employeeData });
        } catch (error) {
          results.failed.push({
            data: employeeData,
            error: error.message
          });
        }
      }

      logger.logBusiness('bulk_import_employees', {
        organizationId: tenant.id,
        total: employees.length,
        success: results.success.length,
        failed: results.failed.length,
        userId: user.id
      });

      return this.success(res, results, `Bulk import completed: ${results.success.length} succeeded, ${results.failed.length} failed`);
    })(req, res, next);
  }

  /**
   * Export employees
   * GET /api/employees/export
   */
  async exportEmployees(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { format = 'json' } = req.query;

      const result = await this.employeeService.getOrganizationEmployees(tenant.id, {
        limit: 10000, // Get all employees
        page: 1
      });

      if (format === 'csv') {
        // Convert to CSV
        const csv = this.convertToCSV(result.data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=employees_${Date.now()}.csv`);
        return res.send(csv);
      }

      // Return JSON
      return this.success(res, result.data, 'Employees exported successfully');
    })(req, res, next);
  }

  /**
   * Convert data to CSV
   * @param {Array} data - Data to convert
   * @returns {String} CSV string
   */
  convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        const escaped = ('' + value).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }
}

module.exports = EmployeeController;
