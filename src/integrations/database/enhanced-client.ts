/**
 * Enhanced Database Client with Proper Filter Chaining
 * Supports PostgreSQL via Backend API with Supabase-like syntax
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

// Auth state change callbacks
const authCallbacks: Array<(event: string, session: any) => void> = [];

// Get/Set auth token
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

// Trigger auth state change
function triggerAuthStateChange(event: string, session: any) {
  authCallbacks.forEach(callback => {
    try {
      callback(event, session);
    } catch (error) {
      console.error('[EnhancedClient] Error in auth callback:', error);
    }
  });
}

/**
 * Query Builder - accumulates filters and executes when .then() is called
 */
class QueryBuilder {
  private tableName: string;
  private selectColumns: string = '*';
  private filters: Record<string, any> = {};
  private client: EnhancedDatabaseClient;

  constructor(table: string, client: EnhancedDatabaseClient) {
    this.tableName = table;
    this.client = client;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    this.filters.select = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.filters[`${column}.eq`] = value;
    return this;
  }

  neq(column: string, value: any) {
    this.filters[`${column}.neq`] = value;
    return this;
  }

  gt(column: string, value: any) {
    this.filters[`${column}.gt`] = value;
    return this;
  }

  gte(column: string, value: any) {
    this.filters[`${column}.gte`] = value;
    return this;
  }

  lt(column: string, value: any) {
    this.filters[`${column}.lt`] = value;
    return this;
  }

  lte(column: string, value: any) {
    this.filters[`${column}.lte`] = value;
    return this;
  }

  like(column: string, pattern: string) {
    this.filters[`${column}.like`] = pattern;
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters[`${column}.ilike`] = pattern;
    return this;
  }

  in(column: string, values: any[]) {
    this.filters[`${column}.in`] = values.join(',');
    return this;
  }

  is(column: string, value: any) {
    this.filters[`${column}.is`] = value;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const direction = options?.ascending === false ? 'desc' : 'asc';
    this.filters.order = `${column}.${direction}`;
    return this;
  }

  limit(count: number) {
    this.filters.limit = count.toString();
    return this;
  }

  range(from: number, to: number) {
    this.filters.offset = from.toString();
    this.filters.limit = (to - from + 1).toString();
    return this;
  }

  // Execute query and return array in Supabase format
  then(onFulfilled?: any, onRejected?: any) {
    return this._execute().then(onFulfilled, onRejected);
  }

  private async _execute() {
    try {
      const result = await this.client.executeQuery('GET', this.tableName, this.filters);
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  // Execute query and return single result
  async single() {
    this.filters.single = 'true';
    try {
      const result = await this.client.executeQuery('GET', this.tableName, this.filters);
      if (!result) throw new Error('No rows returned');
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  // Execute query and return single result or null
  async maybeSingle() {
    this.filters.single = 'true';
    try {
      const result = await this.client.executeQuery('GET', this.tableName, this.filters);
      return { data: result ?? null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
}

/**
 * Insert/Update/Delete Builder
 */
class MutationBuilder {
  private tableName: string;
  private method: string;
  private bodyData: any;
  private filters: Record<string, any> = {};
  private client: EnhancedDatabaseClient;

  constructor(table: string, method: string, data: any, client: EnhancedDatabaseClient) {
    this.tableName = table;
    this.method = method;
    this.bodyData = data;
    this.client = client;
  }

  eq(column: string, value: any) {
    this.filters[`${column}.eq`] = value;
    return this;
  }

  select(columns?: string) {
    this.filters.select = columns || '*';
    return this;
  }

  async single() {
    try {
      const result = await this.client.executeQuery(
        this.method,
        this.tableName,
        this.filters,
        this.bodyData
      );
      const data = Array.isArray(result) ? result[0] : result;
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  then(onFulfilled?: any, onRejected?: any) {
    return this._execute().then(onFulfilled, onRejected);
  }

  private async _execute() {
    try {
      const result = await this.client.executeQuery(
        this.method,
        this.tableName,
        this.filters,
        this.bodyData
      );
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
}

/**
 * Enhanced Database Client with Builder Pattern
 */
export class EnhancedDatabaseClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async executeQuery(method: string, table: string, params: any = {}, body?: any): Promise<any> {
    const token = getAuthToken();
    const queryString = new URLSearchParams();

    Object.keys(params).forEach(key => {
      queryString.append(key, String(params[key]));
    });

    const url = `${this.baseUrl}/rest/v1/${table}${queryString.toString() ? '?' + queryString.toString() : ''}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      // Handle 401/403 - token invalid
      if (response.status === 401 || response.status === 403) {
        console.log('[EnhancedClient] Token invalid, clearing auth...');
        setAuthToken(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:token-invalid'));
          if ((window as any).queryClient) {
            (window as any).queryClient.clear();
          }
        }
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
    // Remove schema prefix if present
    let tableName = table.replace('grxbooks.', '');
    if (!tableName.startsWith('auth.')) {
      tableName = tableName.replace('auth.', '');
    }

    return {
      select: (columns: string = '*') => {
        const builder = new QueryBuilder(tableName, this);
        return builder.select(columns);
      },
      insert: (data: any) => {
        const builder = new MutationBuilder(
          tableName,
          'POST',
          Array.isArray(data) ? data : [data],
          this
        );
        return builder;
      },
      update: (data: any) => {
        const builder = new MutationBuilder(tableName, 'PATCH', data, this);
        return builder;
      },
      delete: () => {
        const builder = new MutationBuilder(tableName, 'DELETE', null, this);
        return builder;
      },
    };
  }

  // Helper method for auth API calls
  private async authFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
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
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  auth = {
    getSession: async () => {
      const token = getAuthToken();
      if (!token) {
        return { data: { session: null }, error: null };
      }

      try {
        const user = await this.authFetch('/auth/v1/user');
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
        const response = await this.authFetch('/auth/v1/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            data: credentials.options?.data || {}
          })
        });

        setAuthToken(response.session.access_token);

        // Trigger auth state change
        triggerAuthStateChange('SIGNED_IN', response.session);

        return { data: response, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
    signInWithPassword: async (credentials: { email: string; password: string }) => {
      try {
        const response = await this.authFetch('/auth/v1/token', {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            grant_type: 'password'
          })
        });

        setAuthToken(response.access_token);

        const session = { access_token: response.access_token, user: response.user };

        // Trigger auth state change
        triggerAuthStateChange('SIGNED_IN', session);

        return { data: { session }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
    signOut: async () => {
      try {
        await this.authFetch('/auth/v1/logout', { method: 'POST' });
        setAuthToken(null);

        // Trigger auth state change
        triggerAuthStateChange('SIGNED_OUT', null);

        return { error: null };
      } catch (error: any) {
        setAuthToken(null);

        // Trigger auth state change even on error
        triggerAuthStateChange('SIGNED_OUT', null);

        return { error: { message: error.message } };
      }
    },
    resetPasswordForEmail: async (email: string, options?: any) => {
      return { data: null, error: { message: 'Password reset not implemented' } };
    },
    updateUser: async (updates: any) => {
      return { data: null, error: { message: 'User update not implemented' } };
    },
    setSession: async (session: { access_token: string; refresh_token?: string }) => {
      setAuthToken(session.access_token);

      // Get user data to build complete session
      try {
        const user = await this.authFetch('/auth/v1/user');
        const completeSession = {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user: user
        };

        // Trigger auth state change
        triggerAuthStateChange('SIGNED_IN', completeSession);

        return { data: { session: completeSession }, error: null };
      } catch (error: any) {
        return { data: { session }, error: null };
      }
    },
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      // Store callback for later use
      authCallbacks.push(callback);

      // Call with initial session
      this.auth.getSession().then(({ data }) => {
        callback('INITIAL_SESSION', data.session);
      });

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const index = authCallbacks.indexOf(callback);
              if (index > -1) {
                authCallbacks.splice(index, 1);
              }
            }
          }
        }
      };
    }
  };

  functions = {
    invoke: async (functionName: string, options?: { body?: any }) => {
      try {
        const token = getAuthToken();
        const url = `${this.baseUrl}/functions/v1/${functionName}`;

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(options?.body || {}),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(error.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return { data, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
  };
}

// Export client instance
export const enhancedDb = new EnhancedDatabaseClient(API_URL);

// For backward compatibility, also export as supabase and db
export const supabase = enhancedDb;
export const db = enhancedDb;
