/**
 * Employee API Service
 *
 * Handles all employee-related API calls
 * Replaces direct Supabase queries
 */

import { apiClient, ApiResponse } from './client';

export interface Employee {
  id: string;
  employee_id?: string;
  full_name: string;
  email: string;
  ms365_email: string;
  department?: string;
  designation?: string;
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  phone_number?: string;
  date_of_birth?: string;
  date_of_joining?: string;
  gender?: string;
  role?: {
    organization: string;
    platform?: string;
    is_admin: boolean;
    is_platform_admin: boolean;
  };
  custom_fields?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateEmployeeData {
  full_name: string;
  email: string;
  ms365_email: string;
  employee_id?: string;
  department?: string;
  designation?: string;
  status?: string;
  phone_number?: string;
  date_of_birth?: string;
  date_of_joining?: string;
  gender?: string;
  custom_fields?: Record<string, any>;
}

export interface UpdateEmployeeData extends Partial<CreateEmployeeData> {}

export interface EmployeeQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  department?: string;
  search?: string;
}

export interface EmployeeStatistics {
  total_employees: number;
  active_employees: number;
  inactive_employees: number;
  on_leave_employees: number;
  total_departments: number;
  new_hires_30_days: number;
}

class EmployeeService {
  private basePath = '/employees';

  /**
   * Get all employees (paginated)
   */
  async getEmployees(params?: EmployeeQueryParams): Promise<ApiResponse<Employee[]>> {
    return apiClient.get<Employee[]>(this.basePath, params);
  }

  /**
   * Get single employee by ID
   */
  async getEmployee(id: string): Promise<ApiResponse<Employee>> {
    return apiClient.get<Employee>(`${this.basePath}/${id}`);
  }

  /**
   * Create new employee
   */
  async createEmployee(data: CreateEmployeeData): Promise<ApiResponse<Employee>> {
    return apiClient.post<Employee>(this.basePath, data);
  }

  /**
   * Update employee
   */
  async updateEmployee(id: string, data: UpdateEmployeeData): Promise<ApiResponse<Employee>> {
    return apiClient.put<Employee>(`${this.basePath}/${id}`, data);
  }

  /**
   * Delete employee
   */
  async deleteEmployee(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`${this.basePath}/${id}`);
  }

  /**
   * Update employee status
   */
  async updateEmployeeStatus(
    id: string,
    status: string,
    reason?: string
  ): Promise<ApiResponse<Employee>> {
    return apiClient.patch<Employee>(`${this.basePath}/${id}/status`, {
      status,
      reason
    });
  }

  /**
   * Get organization statistics
   */
  async getStatistics(): Promise<ApiResponse<EmployeeStatistics>> {
    return apiClient.get<EmployeeStatistics>(`${this.basePath}/statistics`);
  }

  /**
   * Get employees by department
   */
  async getEmployeesByDepartment(department: string): Promise<ApiResponse<Employee[]>> {
    return apiClient.get<Employee[]>(`${this.basePath}/department/${department}`);
  }

  /**
   * Bulk import employees
   */
  async bulkImport(employees: CreateEmployeeData[]): Promise<ApiResponse<{
    success: Employee[];
    failed: Array<{ data: CreateEmployeeData; error: string }>;
  }>> {
    return apiClient.post(`${this.basePath}/bulk-import`, { employees });
  }

  /**
   * Export employees
   */
  async exportEmployees(format: 'json' | 'csv' = 'json'): Promise<any> {
    const response = await apiClient.get(`${this.basePath}/export`, { format });

    if (format === 'csv') {
      // Handle CSV download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employees_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }

    return response;
  }

  /**
   * Search employees
   */
  async searchEmployees(query: string, limit?: number): Promise<ApiResponse<Employee[]>> {
    return apiClient.get<Employee[]>(this.basePath, {
      search: query,
      limit: limit || 20
    });
  }
}

// Export singleton instance
export const employeeService = new EmployeeService();
