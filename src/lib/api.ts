/**
 * API Client for backend communication
 * Handles dev mode role impersonation headers
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Custom headers that should be attached to every request
 */
let customHeaders: Record<string, string> = {};

/**
 * Set a custom header to be included in all requests
 */
export const setCustomHeader = (key: string, value: string) => {
  customHeaders[key] = value;
};

/**
 * Remove a custom header
 */
export const removeCustomHeader = (key: string) => {
  delete customHeaders[key];
};

/**
 * Get all custom headers
 */
export const getCustomHeaders = () => ({ ...customHeaders });

/**
 * Make an API request with automatic header injection
 */
export const apiRequest = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
    ...options.headers,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies for session
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Request failed: ${response.statusText}`);
  }
  
  return response.json();
};

/**
 * Convenience methods
 */
export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),
    
  post: <T = any>(endpoint: string, data?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
    
  put: <T = any>(endpoint: string, data?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),
    
  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
