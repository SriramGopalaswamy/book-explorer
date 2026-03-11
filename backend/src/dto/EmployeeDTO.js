/**
 * Employee Data Transfer Objects
 *
 * Transforms database records into consistent API responses
 * Handles data mapping, formatting, and field selection
 */

class EmployeeDTO {
  /**
   * Transform single employee for API response
   * @param {Object} employee - Employee record from database
   * @param {Object} options - Transform options
   * @returns {Object} Formatted employee
   */
  static toResponse(employee, options = {}) {
    if (!employee) return null;

    const {
      includeRole = true,
      includeCustomFields = true,
      includeSensitive = false
    } = options;

    const response = {
      id: employee.id,
      employee_id: employee.employee_id,
      full_name: employee.full_name,
      email: employee.email,
      ms365_email: employee.ms365_email,
      department: employee.department,
      designation: employee.designation,
      status: employee.status,
      phone_number: employee.phone_number,
      date_of_joining: employee.date_of_joining,
      created_at: employee.created_at,
      updated_at: employee.updated_at
    };

    // Add role information if available
    if (includeRole && employee.organization_role) {
      response.role = {
        organization: employee.organization_role,
        platform: employee.platform_role || null,
        is_admin: ['admin', 'hr'].includes(employee.organization_role),
        is_platform_admin: employee.platform_role === 'super_admin'
      };
    }

    // Add custom fields if available
    if (includeCustomFields && employee.custom_fields) {
      response.custom_fields = employee.custom_fields;
    }

    // Include sensitive information only if explicitly requested
    if (includeSensitive) {
      response.date_of_birth = employee.date_of_birth;
      response.gender = employee.gender;
      response.address = employee.address;
      response.emergency_contact_name = employee.emergency_contact_name;
      response.emergency_contact_phone = employee.emergency_contact_phone;
    }

    return response;
  }

  /**
   * Transform array of employees
   * @param {Array} employees - Array of employee records
   * @param {Object} options - Transform options
   * @returns {Array} Formatted employees
   */
  static toResponseArray(employees, options = {}) {
    if (!Array.isArray(employees)) return [];

    return employees.map(employee => this.toResponse(employee, options));
  }

  /**
   * Transform employee for list view (minimal data)
   * @param {Object} employee - Employee record
   * @returns {Object} Minimal employee data
   */
  static toListItem(employee) {
    if (!employee) return null;

    return {
      id: employee.id,
      employee_id: employee.employee_id,
      full_name: employee.full_name,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      status: employee.status,
      avatar_url: employee.avatar_url || null
    };
  }

  /**
   * Transform for list view
   * @param {Array} employees - Array of employee records
   * @returns {Array} Minimal employee data
   */
  static toListArray(employees) {
    if (!Array.isArray(employees)) return [];

    return employees.map(employee => this.toListItem(employee));
  }

  /**
   * Transform employee with statistics
   * @param {Object} employee - Employee record
   * @param {Object} stats - Employee statistics
   * @returns {Object} Employee with stats
   */
  static toDetailedResponse(employee, stats = {}) {
    const response = this.toResponse(employee, {
      includeRole: true,
      includeCustomFields: true,
      includeSensitive: true
    });

    response.statistics = {
      total_leaves: stats.total_leaves || 0,
      pending_leaves: stats.pending_leaves || 0,
      approved_leaves: stats.approved_leaves || 0,
      attendance_percentage: stats.attendance_percentage || 100,
      performance_score: stats.performance_score || null,
      tenure_years: this.calculateTenure(employee.date_of_joining)
    };

    return response;
  }

  /**
   * Transform for export (CSV/Excel)
   * @param {Object} employee - Employee record
   * @returns {Object} Flat structure for export
   */
  static toExport(employee) {
    if (!employee) return null;

    return {
      'Employee ID': employee.employee_id,
      'Full Name': employee.full_name,
      'Email': employee.email,
      'MS365 Email': employee.ms365_email,
      'Department': employee.department,
      'Designation': employee.designation,
      'Status': employee.status,
      'Phone': employee.phone_number,
      'Date of Joining': this.formatDate(employee.date_of_joining),
      'Date of Birth': this.formatDate(employee.date_of_birth),
      'Gender': employee.gender,
      'Role': employee.organization_role,
      'Created At': this.formatDate(employee.created_at)
    };
  }

  /**
   * Transform array for export
   * @param {Array} employees - Array of employee records
   * @returns {Array} Flat structure for export
   */
  static toExportArray(employees) {
    if (!Array.isArray(employees)) return [];

    return employees.map(employee => this.toExport(employee));
  }

  /**
   * Transform for calendar/timeline view
   * @param {Object} employee - Employee record
   * @returns {Object} Simplified for calendar
   */
  static toCalendarItem(employee) {
    if (!employee) return null;

    return {
      id: employee.id,
      title: employee.full_name,
      subtitle: employee.designation,
      department: employee.department,
      avatar_url: employee.avatar_url,
      status: employee.status
    };
  }

  /**
   * Transform from request body to database format
   * @param {Object} data - Request body
   * @param {Object} context - User/tenant context
   * @returns {Object} Database-ready format
   */
  static fromRequest(data, context = {}) {
    const dbData = {
      full_name: data.full_name,
      email: data.email?.toLowerCase(),
      ms365_email: data.ms365_email?.toLowerCase(),
      employee_id: data.employee_id,
      department: data.department,
      designation: data.designation,
      status: data.status || 'active',
      phone_number: data.phone_number,
      date_of_birth: data.date_of_birth,
      date_of_joining: data.date_of_joining || new Date(),
      gender: data.gender,
      address: data.address,
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_phone: data.emergency_contact_phone,
      organization_id: context.tenantId,
      created_by: context.userId
    };

    // Remove undefined values
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) {
        delete dbData[key];
      }
    });

    return dbData;
  }

  /**
   * Calculate tenure in years
   * @param {Date} joiningDate - Date of joining
   * @returns {Number} Tenure in years
   */
  static calculateTenure(joiningDate) {
    if (!joiningDate) return 0;

    const date = new Date(joiningDate);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);

    return Math.round(diffYears * 10) / 10; // Round to 1 decimal
  }

  /**
   * Format date for display
   * @param {Date} date - Date to format
   * @returns {String} Formatted date
   */
  static formatDate(date) {
    if (!date) return null;

    return new Date(date).toISOString().split('T')[0];
  }

  /**
   * Transform paginated response
   * @param {Array} employees - Array of employees
   * @param {Object} pagination - Pagination info
   * @param {Object} options - Transform options
   * @returns {Object} Paginated response
   */
  static toPaginatedResponse(employees, pagination, options = {}) {
    return {
      data: this.toResponseArray(employees, options),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        total_pages: pagination.totalPages,
        has_next: pagination.page < pagination.totalPages,
        has_previous: pagination.page > 1
      }
    };
  }

  /**
   * Transform search results with ranking
   * @param {Array} results - Search results with rank
   * @returns {Array} Formatted search results
   */
  static toSearchResults(results) {
    if (!Array.isArray(results)) return [];

    return results.map(result => ({
      ...this.toListItem(result),
      relevance: result.rank || 0
    }));
  }
}

module.exports = EmployeeDTO;
