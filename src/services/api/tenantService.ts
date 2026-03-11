/**
 * Tenant API Service
 *
 * Handles tenant customization, settings, features, and custom fields
 */

import { apiClient, ApiResponse } from './client';

export interface TenantConfig {
  organization: {
    id: string;
    name: string;
    subdomain: string;
    subscription_tier: string;
  };
  settings: Record<string, Record<string, any>>;
  features: string[];
  enabledFeatures: Array<{
    feature_key: string;
    feature_name: string;
    is_enabled: boolean;
  }>;
}

export interface CustomField {
  id: string;
  entity_type: string;
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'boolean' | 'file';
  field_options?: {
    options: string[];
  };
  default_value?: any;
  is_required: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  help_text?: string;
}

export interface Feature {
  id: string;
  feature_key: string;
  feature_name: string;
  is_enabled: boolean;
  tier_restriction: string;
}

class TenantService {
  private basePath = '/tenant';

  /**
   * Get complete tenant configuration
   */
  async getConfig(): Promise<ApiResponse<TenantConfig>> {
    return apiClient.get<TenantConfig>(`${this.basePath}/config`);
  }

  /**
   * Get all settings
   */
  async getSettings(category?: string): Promise<ApiResponse<any[]>> {
    const params = category ? { category } : undefined;
    return apiClient.get(`${this.basePath}/settings`, params);
  }

  /**
   * Get settings by category
   */
  async getSettingsByCategory(category: string): Promise<ApiResponse<Record<string, any>>> {
    return apiClient.get(`${this.basePath}/settings/${category}`);
  }

  /**
   * Update single setting
   */
  async updateSetting(category: string, key: string, value: any): Promise<ApiResponse<any>> {
    return apiClient.put(`${this.basePath}/settings/${category}/${key}`, { value });
  }

  /**
   * Bulk update settings
   */
  async bulkUpdateSettings(settings: Array<{
    category: string;
    key: string;
    value: any;
    dataType?: string;
  }>): Promise<ApiResponse<any[]>> {
    return apiClient.post(`${this.basePath}/settings/bulk`, { settings });
  }

  /**
   * Get custom fields for entity type
   */
  async getCustomFields(entityType: string): Promise<ApiResponse<CustomField[]>> {
    return apiClient.get<CustomField[]>(`${this.basePath}/custom-fields/${entityType}`);
  }

  /**
   * Create custom field
   */
  async createCustomField(data: Partial<CustomField>): Promise<ApiResponse<CustomField>> {
    return apiClient.post<CustomField>(`${this.basePath}/custom-fields`, data);
  }

  /**
   * Update custom field
   */
  async updateCustomField(id: string, data: Partial<CustomField>): Promise<ApiResponse<CustomField>> {
    return apiClient.put<CustomField>(`${this.basePath}/custom-fields/${id}`, data);
  }

  /**
   * Delete custom field
   */
  async deleteCustomField(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`${this.basePath}/custom-fields/${id}`);
  }

  /**
   * Get entity custom field values
   */
  async getEntityCustomFieldValues(
    entityType: string,
    entityId: string
  ): Promise<ApiResponse<any[]>> {
    return apiClient.get(
      `${this.basePath}/custom-fields/${entityType}/${entityId}/values`
    );
  }

  /**
   * Set entity custom field values
   */
  async setEntityCustomFieldValues(
    entityType: string,
    entityId: string,
    fieldValues: Record<string, any>
  ): Promise<ApiResponse<any[]>> {
    return apiClient.post(
      `${this.basePath}/custom-fields/${entityType}/${entityId}/values`,
      { fieldValues }
    );
  }

  /**
   * Get all features
   */
  async getFeatures(): Promise<ApiResponse<Feature[]>> {
    return apiClient.get<Feature[]>(`${this.basePath}/features`);
  }

  /**
   * Check if feature is enabled
   */
  async isFeatureEnabled(featureKey: string): Promise<ApiResponse<{ enabled: boolean }>> {
    return apiClient.get(`${this.basePath}/features/${featureKey}/enabled`);
  }

  /**
   * Toggle feature
   */
  async toggleFeature(featureKey: string, enabled: boolean): Promise<ApiResponse<Feature>> {
    return apiClient.post<Feature>(`${this.basePath}/features/${featureKey}/toggle`, {
      enabled
    });
  }
}

// Export singleton instance
export const tenantService = new TenantService();
