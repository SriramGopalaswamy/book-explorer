/**
 * Employee Service Tests
 *
 * Unit tests for EmployeeService
 */

const EmployeeService = require('../../src/services/EmployeeService');
const EmployeeRepository = require('../../src/repositories/EmployeeRepository');
const { ValidationError, ConflictError } = require('../../src/utils/errors');

// Mock repository
jest.mock('../../src/repositories/EmployeeRepository');

describe('EmployeeService', () => {
  let employeeService;
  let mockRepository;

  beforeEach(() => {
    mockRepository = new EmployeeRepository();
    employeeService = new EmployeeService(mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEmployee', () => {
    it('should create employee successfully', async () => {
      const mockEmployee = {
        id: 'emp-123',
        full_name: 'John Doe',
        email: 'john@example.com',
        organization_id: 'org-123'
      };

      const context = {
        userId: 'user-123',
        tenantId: 'org-123'
      };

      mockRepository.emailExists.mockResolvedValue(false);
      mockRepository.create.mockResolvedValue(mockEmployee);

      const result = await employeeService.createEmployee(
        { full_name: 'John Doe', email: 'john@example.com' },
        context
      );

      expect(result).toEqual(mockEmployee);
      expect(mockRepository.emailExists).toHaveBeenCalledWith(
        'john@example.com',
        'org-123'
      );
    });

    it('should throw ConflictError if email exists', async () => {
      const context = {
        userId: 'user-123',
        tenantId: 'org-123'
      };

      mockRepository.emailExists.mockResolvedValue(true);

      await expect(
        employeeService.createEmployee(
          { full_name: 'John Doe', email: 'john@example.com' },
          context
        )
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError for invalid data', async () => {
      const context = {
        userId: 'user-123',
        tenantId: 'org-123'
      };

      await expect(
        employeeService.createEmployee(
          { email: 'invalid-email' },
          context
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getOrganizationEmployees', () => {
    it('should return paginated employees', async () => {
      const mockEmployees = [
        { id: '1', full_name: 'John Doe' },
        { id: '2', full_name: 'Jane Smith' }
      ];

      mockRepository.findByOrganization.mockResolvedValue({
        rows: mockEmployees,
        total: 2
      });

      const result = await employeeService.getOrganizationEmployees('org-123', {
        page: 1,
        limit: 20
      });

      expect(result.data).toEqual(mockEmployees);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1
      });
    });
  });

  describe('updateEmployeeStatus', () => {
    it('should update status successfully', async () => {
      const mockEmployee = {
        id: 'emp-123',
        status: 'inactive'
      };

      const context = {
        userId: 'user-123',
        tenantId: 'org-123'
      };

      mockRepository.findById.mockResolvedValue({ id: 'emp-123', organization_id: 'org-123' });
      mockRepository.updateStatus.mockResolvedValue(mockEmployee);

      const result = await employeeService.updateEmployeeStatus(
        'emp-123',
        'inactive',
        context
      );

      expect(result).toEqual(mockEmployee);
      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        'emp-123',
        'inactive',
        'user-123'
      );
    });

    it('should throw ValidationError for invalid status', async () => {
      const context = {
        userId: 'user-123',
        tenantId: 'org-123'
      };

      await expect(
        employeeService.updateEmployeeStatus(
          'emp-123',
          'invalid-status',
          context
        )
      ).rejects.toThrow(ValidationError);
    });
  });
});
