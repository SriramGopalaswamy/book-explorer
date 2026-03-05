/**
 * Database Client - Connects to PostgreSQL via Backend API
 * Replaces Supabase client completely
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Set auth token in localStorage
function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

// Custom database client that mimics Supabase client interface
class DatabaseClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = getAuthToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Handle 401/403 - token invalid or expired
      if (response.status === 401 || response.status === 403) {
        console.log('[DatabaseClient] Token invalid (401/403), clearing auth and cache...');
        setAuthToken(null);
        localStorage.removeItem('auth_token');
        // Clear React Query cache - trigger window event for App.tsx to handle
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:token-invalid'));
          // Also try direct access if available
          if ((window as any).queryClient) {
            (window as any).queryClient.clear();
            (window as any).queryClient.resetQueries();
          }
        }
        // Redirect to login
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth')) {
          window.location.href = '/auth';
        }
      }
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  from(table: string) {
    // Remove schema prefix if present, but keep auth. prefix
    let tableName = table.replace('grxbooks.', '');
    // Don't remove auth. prefix - it's needed for auth.users
    if (tableName.startsWith('auth.')) {
      // Keep as is
    } else {
      tableName = tableName.replace('auth.', '');
    }
    
    return {
      select: (columns: string = '*') => ({
        eq: (column: string, value: any) => ({
          maybeSingle: async () => {
            try {
              const result = await this.query('GET', tableName, { [`${column}.eq`]: value, select: columns, single: 'true' });
              // Supabase format: { data: result, error: null }
              // Ensure we return null instead of undefined
              return { data: result ?? null, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          single: async () => {
            try {
              const result = await this.query('GET', tableName, { [`${column}.eq`]: value, select: columns, single: 'true' });
              if (!result) throw new Error('No rows returned');
              return { data: result, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          order: (orderColumn: string, options?: { ascending?: boolean }) => ({
            limit: (limitValue: number) => ({
            maybeSingle: async () => {
              try {
                const result = await this.query('GET', tableName, { 
                  [`${column}.eq`]: value, 
                  select: columns, 
                  order: `${orderColumn}.${options?.ascending === false ? 'desc' : 'asc'}`,
                  limit: limitValue.toString(),
                  single: 'true'
                });
                return { data: result ?? null, error: null };
              } catch (error: any) {
                return { data: null, error: { message: error.message } };
              }
            },
              then: async () => this.query('GET', tableName, { 
                [`${column}.eq`]: value, 
                select: columns, 
                order: `${orderColumn}.${options?.ascending === false ? 'desc' : 'asc'}`,
                limit: limitValue.toString()
              }),
            }),
            maybeSingle: async () => {
              try {
                const result = await this.query('GET', tableName, { 
                  [`${column}.eq`]: value, 
                  select: columns, 
                  order: `${orderColumn}.${options?.ascending === false ? 'desc' : 'asc'}`,
                  single: 'true'
                });
                return { data: result ?? null, error: null };
              } catch (error: any) {
                return { data: null, error: { message: error.message } };
              }
            },
            then: async () => this.query('GET', tableName, { 
              [`${column}.eq`]: value, 
              select: columns, 
              order: `${orderColumn}.${options?.ascending === false ? 'desc' : 'asc'}`
            }),
          }),
          then: async () => this.query('GET', tableName, { [`${column}.eq`]: value, select: columns }),
        }),
        neq: (column: string, value: any) => this.query('GET', tableName, { [`${column}.neq`]: value, select: columns }),
        gte: (column: string, value: any) => this.query('GET', tableName, { [`${column}.gte`]: value, select: columns }),
        lte: (column: string, value: any) => this.query('GET', tableName, { [`${column}.lte`]: value, select: columns }),
        gt: (column: string, value: any) => this.query('GET', tableName, { [`${column}.gt`]: value, select: columns }),
        lt: (column: string, value: any) => this.query('GET', tableName, { [`${column}.lt`]: value, select: columns }),
        in: (column: string, values: any[]) => this.query('GET', tableName, { [`${column}.in`]: values.join(','), select: columns }),
        order: (column: string, options?: { ascending?: boolean }) => ({
          maybeSingle: async () => {
            try {
              const result = await this.query('GET', tableName, { select: columns, order: `${column}.${options?.ascending === false ? 'desc' : 'asc'}`, single: 'true' });
              return { data: result ?? null, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          then: async () => this.query('GET', tableName, { select: columns, order: `${column}.${options?.ascending === false ? 'desc' : 'asc'}` })
        }),
        maybeSingle: async () => {
          try {
            const result = await this.query('GET', tableName, { select: columns, single: 'true' });
            return { data: result ?? null, error: null };
          } catch (error: any) {
            return { data: null, error: { message: error.message } };
          }
        },
        single: async () => {
          const result = await this.query('GET', tableName, { select: columns, single: 'true' });
          if (!result) throw new Error('No rows returned');
          return result;
        },
        then: async () => this.query('GET', tableName, { select: columns }),
      }),
      insert: (data: any) => ({
        select: (columns?: string) => ({
          single: async () => {
            const result = await this.query('POST', tableName, {}, Array.isArray(data) ? data : [data]);
            return Array.isArray(result) ? result[0] : result;
          },
          then: async () => this.query('POST', tableName, {}, Array.isArray(data) ? data : [data]),
        }),
        then: async () => this.query('POST', tableName, {}, Array.isArray(data) ? data : [data]),
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          select: (columns?: string) => ({
            single: async () => {
              const result = await this.query('PATCH', tableName, { [`${column}.eq`]: value }, data);
              return Array.isArray(result) ? result[0] : result;
            },
            then: async () => this.query('PATCH', tableName, { [`${column}.eq`]: value }, data),
          }),
          then: async () => this.query('PATCH', tableName, { [`${column}.eq`]: value }, data),
        }),
        then: async () => this.query('PATCH', tableName, {}, data),
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          then: async () => this.query('DELETE', tableName, { [`${column}.eq`]: value }),
        }),
        then: async () => this.query('DELETE', tableName, {}),
      }),
    };
  }

  private async query(method: string, table: string, params: any = {}, body?: any): Promise<any> {
    const queryString = new URLSearchParams();
    Object.keys(params).forEach(key => {
      queryString.append(key, String(params[key]));
    });

    const url = `/rest/v1/${table}${queryString.toString() ? '?' + queryString.toString() : ''}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    return this.request(url, options);
  }

  // Auth methods
  auth = {
    getSession: async () => {
      const token = getAuthToken();
      if (!token) {
        return { data: { session: null }, error: null };
      }

      try {
        const user = await this.request('/auth/v1/user');
        return {
          data: {
            session: {
              access_token: token,
              user: user
            }
          },
          error: null
        };
      } catch (error: any) {
        setAuthToken(null);
        return { data: { session: null }, error: { message: error.message } };
      }
    },
    signUp: async (credentials: { email: string; password: string; options?: any }) => {
      try {
        const response = await this.request('/auth/v1/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            data: credentials.options?.data || {}
          })
        });
        
        setAuthToken(response.session.access_token);
        return { data: response, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
    signInWithPassword: async (credentials: { email: string; password: string }) => {
      try {
        const response = await this.request('/auth/v1/token', {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            grant_type: 'password'
          })
        });
        
        setAuthToken(response.access_token);
        return { data: { session: { access_token: response.access_token, user: response.user } }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
    signOut: async () => {
      try {
        await this.request('/auth/v1/logout', { method: 'POST' });
        setAuthToken(null);
        return { error: null };
      } catch (error: any) {
        setAuthToken(null);
        return { error: { message: error.message } };
      }
    },
    resetPasswordForEmail: async (email: string, options?: any) => {
      // Stub - implement password reset if needed
      return { data: null, error: { message: 'Password reset not implemented' } };
    },
    updateUser: async (updates: any) => {
      // Stub - implement user update if needed
      return { data: null, error: { message: 'User update not implemented' } };
    },
    setSession: async (session: { access_token: string; refresh_token?: string }) => {
      setAuthToken(session.access_token);
      return { data: { session }, error: null };
    },
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      // Simple implementation - check session on mount
      this.auth.getSession().then(({ data }) => {
        callback('INITIAL_SESSION', data.session);
      });

      // Return unsubscribe function
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    }
  };

  // Functions (stub)
  functions = {
    invoke: async (functionName: string, options?: { body?: any }) => {
      try {
        const response = await this.request(`/functions/v1/${functionName}`, {
          method: 'POST',
          body: JSON.stringify(options?.body || {})
        });
        return { data: response, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
  };

  // RPC (Remote Procedure Call) for database functions
  rpc = async (functionName: string, params?: any) => {
    try {
      const response = await this.request(`/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        body: JSON.stringify(params || {})
      });
      return { data: response, error: null };
    } catch (error: any) {
      console.error(`RPC call to ${functionName} failed:`, error);
      return { data: null, error: { message: error.message } };
    }
  };
}

// Export database client
export const db = new DatabaseClient(API_URL);

// For backward compatibility, also export as supabase
export const supabase = db;
