/**
 * Employee Validation Schemas
 *
 * Request validation using Joi
 */

const Joi = require('joi');

class EmployeeValidator {
  /**
   * Create employee validation schema
   */
  static createEmployee = Joi.object({
    full_name: Joi.string().min(2).max(255).required()
      .messages({
        'string.empty': 'Full name is required',
        'string.min': 'Full name must be at least 2 characters',
        'string.max': 'Full name cannot exceed 255 characters'
      }),

    email: Joi.string().email().required()
      .messages({
        'string.email': 'Must be a valid email address',
        'string.empty': 'Email is required'
      }),

    ms365_email: Joi.string().email().required()
      .messages({
        'string.email': 'Must be a valid MS365 email address',
        'string.empty': 'MS365 email is required'
      }),

    employee_id: Joi.string().max(50).optional(),

    department: Joi.string().max(100).optional(),

    designation: Joi.string().max(100).optional(),

    status: Joi.string()
      .valid('active', 'inactive', 'on_leave', 'terminated')
      .default('active')
      .messages({
        'any.only': 'Status must be one of: active, inactive, on_leave, terminated'
      }),

    phone_number: Joi.string()
      .pattern(/^\+?[0-9\s\-\(\)]+$/)
      .max(20)
      .optional()
      .messages({
        'string.pattern.base': 'Phone number format is invalid'
      }),

    date_of_birth: Joi.date().max('now').optional()
      .messages({
        'date.max': 'Date of birth cannot be in the future'
      }),

    date_of_joining: Joi.date().max('now').optional()
      .messages({
        'date.max': 'Date of joining cannot be in the future'
      }),

    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),

    address: Joi.string().max(500).optional(),

    emergency_contact_name: Joi.string().max(255).optional(),

    emergency_contact_phone: Joi.string().max(20).optional(),

    custom_fields: Joi.object().optional()
  });

  /**
   * Update employee validation schema
   */
  static updateEmployee = Joi.object({
    full_name: Joi.string().min(2).max(255).optional(),
    email: Joi.string().email().optional(),
    ms365_email: Joi.string().email().optional(),
    employee_id: Joi.string().max(50).optional(),
    department: Joi.string().max(100).optional(),
    designation: Joi.string().max(100).optional(),
    status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated').optional(),
    phone_number: Joi.string().pattern(/^\+?[0-9\s\-\(\)]+$/).max(20).optional(),
    date_of_birth: Joi.date().max('now').optional(),
    date_of_joining: Joi.date().max('now').optional(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    address: Joi.string().max(500).optional(),
    emergency_contact_name: Joi.string().max(255).optional(),
    emergency_contact_phone: Joi.string().max(20).optional(),
    custom_fields: Joi.object().optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  });

  /**
   * Query parameters validation
   */
  static queryParams = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('created_at', 'full_name', 'email', 'department', 'status').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('DESC'),
    status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated').optional(),
    department: Joi.string().max(100).optional(),
    search: Joi.string().max(255).optional()
  });

  /**
   * Bulk import validation
   */
  static bulkImport = Joi.object({
    employees: Joi.array()
      .items(EmployeeValidator.createEmployee)
      .min(1)
      .max(1000)
      .required()
      .messages({
        'array.min': 'At least one employee is required',
        'array.max': 'Cannot import more than 1000 employees at once'
      })
  });

  /**
   * Update status validation
   */
  static updateStatus = Joi.object({
    status: Joi.string()
      .valid('active', 'inactive', 'on_leave', 'terminated')
      .required()
      .messages({
        'any.only': 'Status must be one of: active, inactive, on_leave, terminated',
        'any.required': 'Status is required'
      }),
    reason: Joi.string().max(500).optional(),
    effective_date: Joi.date().optional()
  });

  /**
   * UUID validation
   */
  static uuid = Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Must be a valid UUID',
      'any.required': 'ID is required'
    });
}

module.exports = EmployeeValidator;
