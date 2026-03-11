/**
 * Employee Service
 *
 * Business logic for employee management
 * Extends BaseService for common operations
 */

const BaseService = require('../core/BaseService');
const { ValidationError, ConflictError, BusinessLogicError } = require('../utils/errors');
const logger = require('../utils/logger');

class EmployeeService extends BaseService {
  constructor(employeeRepository) {
    super(employeeRepository);
    this.employeeRepository = employeeRepository;
  }

  /**
   * Get employees for organization
   * @param {String} organizationId - Organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated employees
   */
  async getOrganizationEmployees(organizationId, options = {}) {
    try {
      const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC', status, department, search } = options;

      const result = await this.employeeRepository.findByOrganization(organizationId, {
        limit,
        offset: (page - 1) * limit,
        sortBy,
        sortOrder,
        status,
        department,
        search
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
      logger.error('EmployeeService.getOrganizationEmployees error:', error);
      throw error;
    }
  }

  /**
   * Get employee by ID
   * @param {String} id - Employee ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Employee
   */
  async getEmployeeById(id, organizationId) {
    try {
      const employee = await this.employeeRepository.findById(id);

      if (!employee) {
        throw new NotFoundError(`Employee not found with id: ${id}`);
      }

      // Verify employee belongs to organization
      if (employee.organization_id !== organizationId) {
        throw new ForbiddenError('Employee does not belong to your organization');
      }

      return employee;
    } catch (error) {
      logger.error('EmployeeService.getEmployeeById error:', error);
      throw error;
    }
  }

  /**
   * Create new employee
   * @param {Object} data - Employee data
   * @param {Object} context - User/tenant context
   * @returns {Promise<Object>} Created employee
   */
  async createEmployee(data, context) {
    try {
      // Validate email uniqueness
      const emailExists = await this.employeeRepository.emailExists(data.email, context.tenantId);
      if (emailExists) {
        throw new ConflictError('Email already exists in organization', 'email');
      }

      // Validate employee_id uniqueness if provided
      if (data.employee_id) {
        const employeeIdExists = await this.employeeRepository.findByEmployeeId(
          data.employee_id,
          context.tenantId
        );
        if (employeeIdExists) {
          throw new ConflictError('Employee ID already exists in organization', 'employee_id');
        }
      }

      // Create employee
      const employee = await this.create(data, context);

      logger.logBusiness('employee_created', {
        employeeId: employee.id,
        organizationId: context.tenantId,
        createdBy: context.userId
      });

      return employee;
    } catch (error) {
      logger.error('EmployeeService.createEmployee error:', error);
      throw error;
    }
  }

  /**
   * Update employee
   * @param {String} id - Employee ID
   * @param {Object} data - Update data
   * @param {Object} context - User/tenant context
   * @returns {Promise<Object>} Updated employee
   */
  async updateEmployee(id, data, context) {
    try {
      // Check if employee exists and belongs to organization
      await this.getEmployeeById(id, context.tenantId);

      // Validate email uniqueness if email is being updated
      if (data.email) {
        const emailExists = await this.employeeRepository.emailExists(
          data.email,
          context.tenantId,
          id
        );
        if (emailExists) {
          throw new ConflictError('Email already exists in organization', 'email');
        }
      }

      // Update employee
      const employee = await this.update(id, data, context);

      logger.logBusiness('employee_updated', {
        employeeId: employee.id,
        organizationId: context.tenantId,
        updatedBy: context.userId
      });

      return employee;
    } catch (error) {
      logger.error('EmployeeService.updateEmployee error:', error);
      throw error;
    }
  }

  /**
   * Delete employee
   * @param {String} id - Employee ID
   * @param {Object} context - User/tenant context
   * @returns {Promise<Boolean>} Success status
   */
  async deleteEmployee(id, context) {
    try {
      // Check if employee exists and belongs to organization
      await this.getEmployeeById(id, context.tenantId);

      // Soft delete employee
      const result = await this.delete(id, context);

      logger.logBusiness('employee_deleted', {
        employeeId: id,
        organizationId: context.tenantId,
        deletedBy: context.userId
      });

      return result;
    } catch (error) {
      logger.error('EmployeeService.deleteEmployee error:', error);
      throw error;
    }
  }

  /**
   * Update employee status
   * @param {String} id - Employee ID
   * @param {String} status - New status
   * @param {Object} context - User/tenant context
   * @returns {Promise<Object>} Updated employee
   */
  async updateEmployeeStatus(id, status, context) {
    try {
      // Validate status
      const validStatuses = ['active', 'inactive', 'on_leave', 'terminated'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError('Invalid status', [
          { field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}` }
        ]);
      }

      // Check if employee exists and belongs to organization
      await this.getEmployeeById(id, context.tenantId);

      // Update status
      const employee = await this.employeeRepository.updateStatus(id, status, context.userId);

      logger.logBusiness('employee_status_updated', {
        employeeId: id,
        oldStatus: employee.status,
        newStatus: status,
        organizationId: context.tenantId,
        updatedBy: context.userId
      });

      return employee;
    } catch (error) {
      logger.error('EmployeeService.updateEmployeeStatus error:', error);
      throw error;
    }
  }

  /**
   * Get organization statistics
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Statistics
   */
  async getOrganizationStatistics(organizationId) {
    try {
      const stats = await this.employeeRepository.getStatistics(organizationId);
      return stats;
    } catch (error) {
      logger.error('EmployeeService.getOrganizationStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get employees by department
   * @param {String} organizationId - Organization ID
   * @param {String} department - Department name
   * @returns {Promise<Array>} Employees
   */
  async getEmployeesByDepartment(organizationId, department) {
    try {
      const employees = await this.employeeRepository.findByDepartment(organizationId, department);
      return employees;
    } catch (error) {
      logger.error('EmployeeService.getEmployeesByDepartment error:', error);
      throw error;
    }
  }

  /**
   * Validate create data
   * @param {Object} data - Data to validate
   */
  validateCreateData(data) {
    const errors = [];

    // Required fields
    if (!data.full_name) {
      errors.push({ field: 'full_name', message: 'Full name is required' });
    }

    if (!data.email) {
      errors.push({ field: 'email', message: 'Email is required' });
    } else if (!this.isValidEmail(data.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }

    if (!data.ms365_email) {
      errors.push({ field: 'ms365_email', message: 'MS365 email is required' });
    } else if (!this.isValidEmail(data.ms365_email)) {
      errors.push({ field: 'ms365_email', message: 'Invalid MS365 email format' });
    }

    // Status validation
    if (data.status && !['active', 'inactive', 'on_leave', 'terminated'].includes(data.status)) {
      errors.push({ field: 'status', message: 'Invalid status value' });
    }

    // Date validations
    if (data.date_of_birth && !this.isValidDate(data.date_of_birth)) {
      errors.push({ field: 'date_of_birth', message: 'Invalid date format' });
    }

    if (data.date_of_joining && !this.isValidDate(data.date_of_joining)) {
      errors.push({ field: 'date_of_joining', message: 'Invalid date format' });
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }
  }

  /**
   * Validate update data
   * @param {Object} data - Data to validate
   */
  validateUpdateData(data) {
    const errors = [];

    // Email validation if provided
    if (data.email && !this.isValidEmail(data.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }

    if (data.ms365_email && !this.isValidEmail(data.ms365_email)) {
      errors.push({ field: 'ms365_email', message: 'Invalid MS365 email format' });
    }

    // Status validation if provided
    if (data.status && !['active', 'inactive', 'on_leave', 'terminated'].includes(data.status)) {
      errors.push({ field: 'status', message: 'Invalid status value' });
    }

    // Date validations
    if (data.date_of_birth && !this.isValidDate(data.date_of_birth)) {
      errors.push({ field: 'date_of_birth', message: 'Invalid date format' });
    }

    if (data.date_of_joining && !this.isValidDate(data.date_of_joining)) {
      errors.push({ field: 'date_of_joining', message: 'Invalid date format' });
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }
  }

  /**
   * Validate email format
   * @param {String} email - Email to validate
   * @returns {Boolean} Is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate date format
   * @param {String} date - Date to validate
   * @returns {Boolean} Is valid
   */
  isValidDate(date) {
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj);
  }
}

module.exports = EmployeeService;
