const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Error: JWT_SECRET not found in .env');
  console.error('   Please set JWT_SECRET in your .env file for security.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

// Microsoft 365 OAuth credentials (REQUIRED for MS365 auth)
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());

// Auth middleware - verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 seconds for remote database
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Test database connection
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Connected to PostgreSQL database (connection pool ready)');
    console.log(`✅ Using schema: ${SCHEMA_NAME}`);
  })
  .catch(err => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

// Parse Supabase-style select (e.g., "*, invoice_items (*)")
function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return '*';

  // Check if it has nested selects with parentheses (e.g., "*, invoice_items (*)")
  // If so, we need special handling - for now just return the non-nested part
  if (selectStr.includes('(') && selectStr.includes(')')) {
    // Extract only the main columns before nested relations
    const parts = selectStr.split(',').map(p => p.trim());
    return parts.filter(p => !p.includes('(')).join(', ') || '*';
  }

  // Simple column list - return as is
  return selectStr;
}

// Generic REST endpoint handler (Supabase-compatible)
// Apply authentication middleware to all data queries
app.all('/rest/v1/:table', authenticateToken, async (req, res) => {
  const { table } = req.params;
  const { method } = req;
  
  try {
    console.log(`[REST API] ${method} /rest/v1/${table}`, {
      query: req.query,
      user: req.user?.id
    });
    
    // Remove schema prefix if present (frontend may send grxbooks.table_name)
    let tableName = table.replace(`${SCHEMA_NAME}.`, '');
    // Always use schema prefix to ensure we're querying the correct schema
    const fullTableName = `${SCHEMA_NAME}.${tableName}`;
    
    console.log(`[REST API] Querying table: ${fullTableName}`);
    
    switch (method) {
      case 'GET':
        // Parse query parameters (Supabase-style)
        const select = parseSelect(req.query.select);
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = req.query.offset ? parseInt(req.query.offset) : null;
        const order = req.query.order;
        
        let query = `SELECT ${select} FROM ${fullTableName}`;
        const params = [];
        let paramIndex = 1;
        
        // Handle filters (Supabase PostgREST style)
        const filters = [];
        Object.keys(req.query).forEach(key => {
          // Skip query parameters that are not filters
          if (['select', 'limit', 'offset', 'order', 'single'].includes(key)) return;
          
          // Handle Supabase filter syntax: column.operator=value
          if (key.includes('.')) {
            const [column, operator] = key.split('.');
            const value = req.query[key];
            
            // Handle UUID and string values
            let paramValue = value;
            if (value === 'null') {
              filters.push(`${column} IS NULL`);
              return;
            }
            
            if (operator === 'eq') {
              filters.push(`${column} = $${paramIndex}`);
              params.push(paramValue);
              paramIndex++;
            } else if (operator === 'neq') {
              filters.push(`${column} != $${paramIndex}`);
              params.push(paramValue);
              paramIndex++;
            } else if (operator === 'gt') {
              filters.push(`${column} > $${paramIndex}`);
              params.push(parseFloat(value));
              paramIndex++;
            } else if (operator === 'gte') {
              filters.push(`${column} >= $${paramIndex}`);
              // Don't parse dates as floats - keep as string for date columns
              params.push(isNaN(value) ? value : parseFloat(value));
              paramIndex++;
            } else if (operator === 'lt') {
              filters.push(`${column} < $${paramIndex}`);
              params.push(isNaN(value) ? value : parseFloat(value));
              paramIndex++;
            } else if (operator === 'lte') {
              filters.push(`${column} <= $${paramIndex}`);
              params.push(isNaN(value) ? value : parseFloat(value));
              paramIndex++;
            } else if (operator === 'in') {
              // Handle array values - split comma-separated strings
              const values = Array.isArray(value) ? value : value.split(',').map(v => v.trim());
              const placeholders = values.map((_, i) => `$${paramIndex + i}`).join(', ');
              filters.push(`${column} IN (${placeholders})`);
              params.push(...values);
              paramIndex += values.length;
            }
          } else {
            // Simple equality filter
            filters.push(`${key} = $${paramIndex}`);
            params.push(req.query[key]);
            paramIndex++;
          }
        });
        
        if (filters.length > 0) {
          query += ' WHERE ' + filters.join(' AND ');
        }
        
        if (order) {
          // Handle order format: column.asc or column.desc
          const [column, direction] = order.split('.');
          query += ` ORDER BY ${column} ${direction?.toUpperCase() || 'ASC'}`;
        }
        
        if (limit) {
          query += ` LIMIT $${paramIndex}`;
          params.push(limit);
          paramIndex++;
        }
        
        if (offset) {
          query += ` OFFSET $${paramIndex}`;
          params.push(offset);
          paramIndex++;
        }
        
        console.log(`[REST API] Executing query: ${query}`, params);
        const result = await pool.query(query, params);
        console.log(`[REST API] Query returned ${result.rows.length} rows`);
        if (result.rows.length > 0) {
          console.log(`[REST API] First row data:`, JSON.stringify(result.rows[0], null, 2));
        }
        
        // Handle .single() or .maybeSingle() calls
        if (req.query.single === 'true' || req.headers.prefer?.includes('return=representation')) {
          const singleResult = result.rows.length > 0 ? result.rows[0] : null;
          console.log(`[REST API] Single query result:`, singleResult ? 'Found' : 'Not found');
          // Always return null (not undefined) when no rows found
          res.json(singleResult === undefined ? null : singleResult);
        } else {
          // Set Supabase-compatible headers
          res.setHeader('Content-Range', `0-${result.rows.length - 1}/${result.rows.length}`);
          res.json(result.rows);
        }
        break;
        
      case 'POST':
        const insertData = Array.isArray(req.body) ? req.body : [req.body];
        const columns = Object.keys(insertData[0] || {});
        
        if (columns.length === 0) {
          return res.status(400).json({ error: 'No data provided' });
        }
        
        const values = insertData.map((row, idx) => {
          const placeholders = columns.map((_, i) => `$${idx * columns.length + i + 1}`).join(', ');
          return `(${placeholders})`;
        }).join(', ');
        
        const insertQuery = `
          INSERT INTO ${fullTableName} (${columns.join(', ')})
          VALUES ${values}
          RETURNING *
        `;
        
        const insertParams = insertData.flatMap(row => columns.map(col => row[col] ?? null));
        const insertResult = await pool.query(insertQuery, insertParams);
        
        if (Array.isArray(req.body)) {
          res.json(insertResult.rows);
        } else {
          res.json(insertResult.rows[0]);
        }
        break;
        
      case 'PATCH':
      case 'PUT':
        const updateData = req.body;
        const updateColumns = Object.keys(updateData).filter(k => k !== 'id');
        
        if (updateColumns.length === 0) {
          return res.status(400).json({ error: 'No update data provided' });
        }
        
        const updateValues = updateColumns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        const updateParams = updateColumns.map(col => updateData[col] ?? null);
        
        let updateQuery = `UPDATE ${fullTableName} SET ${updateValues}`;
        
        // Handle id filter from query params or body
        if (req.query.id) {
          updateParams.push(req.query.id);
          updateQuery += ` WHERE id = $${updateParams.length}`;
        } else if (updateData.id) {
          updateParams.push(updateData.id);
          updateQuery += ` WHERE id = $${updateParams.length}`;
        } else {
          return res.status(400).json({ error: 'id required for update' });
        }
        
        updateQuery += ' RETURNING *';
        
        const updateResult = await pool.query(updateQuery, updateParams);
        
        // Handle .single() call
        if (req.query.single === 'true' || req.headers.prefer?.includes('return=representation')) {
          res.json(updateResult.rows[0] || null);
        } else {
          res.json(updateResult.rows);
        }
        break;
        
      case 'DELETE':
        let deleteQuery = `DELETE FROM ${fullTableName}`;
        const deleteParams = [];
        
        // Handle id filter
        if (req.query.id) {
          deleteQuery += ` WHERE id = $1`;
          deleteParams.push(req.query.id);
        } else {
          return res.status(400).json({ error: 'id parameter required for DELETE' });
        }
        
        const deleteResult = await pool.query(deleteQuery, deleteParams);
        res.json({ success: true, count: deleteResult.rowCount });
        break;
        
      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`Error in ${method} /rest/v1/${table}:`, error);
    res.status(500).json({ 
      message: error.message,
      details: error.detail || null,
      hint: error.hint || null,
      code: error.code || null
    });
  }
});

// Authentication endpoints
// Sign up
app.post('/auth/v1/signup', async (req, res) => {
  try {
    const { email, password, data } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in auth.users table
    const { rows: newUsers } = await pool.query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
       VALUES ($1, $2, NOW(), NOW(), NOW(), $3)
       RETURNING id, email, created_at, raw_user_meta_data`,
      [email.toLowerCase(), hashedPassword, JSON.stringify(data || {})]
    );

    const user = newUsers[0];

    // Create profile if full_name is provided
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    if (data?.full_name) {
      await pool.query(
        `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, organization_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET organization_id = COALESCE(${SCHEMA_NAME}.profiles.organization_id, $4)`,
        [user.id, data.full_name, email.toLowerCase(), defaultOrgId]
      );
    }

    // Assign default role (employee) if no role specified
    const adminEmails = ['sriram@grx10.com', 'nikita@grx10.com', 'anchal@grx10.com', 'admin@grx10.com'];
    const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'employee';
    await pool.query(
      `INSERT INTO ${SCHEMA_NAME}.user_roles (user_id, role, organization_id, created_at) 
       VALUES ($1, $2::${SCHEMA_NAME}.app_role, $3, NOW()) 
       ON CONFLICT (user_id, role, organization_id) DO NOTHING`,
      [user.id, role, defaultOrgId]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.raw_user_meta_data || {}
      },
      session: {
        access_token: token,
        refresh_token: token, // Simplified - in production use separate refresh tokens
        expires_in: 604800, // 7 days
        token_type: 'bearer',
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        }
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign in
app.post('/auth/v1/token', async (req, res) => {
  try {
    const { email, password, grant_type } = req.body;

    if (grant_type !== 'password') {
      return res.status(400).json({ error: 'Only password grant type is supported' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const { rows: users } = await pool.query(
      'SELECT id, email, encrypted_password, email_confirmed_at FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const user = users[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.encrypted_password);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    // Auto-confirm email for development (remove this check or make it optional)
    // For production, you might want to require email confirmation
    if (!user.email_confirmed_at) {
      // Auto-confirm the email if not already confirmed
      await pool.query(
        'UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = $1',
        [user.id]
      );
    }

    // Ensure profile exists (fix for missing profiles causing auto-logout)
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    await pool.query(
      `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, organization_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         organization_id = COALESCE(${SCHEMA_NAME}.profiles.organization_id, $4),
         updated_at = NOW()`,
      [user.id, user.email, user.email, defaultOrgId]
    );

    // Ensure super_admin users have platform_roles entry
    const superAdminEmails = ['sriram@grx10.com', 'nikita@grx10.com', 'anchal@grx10.com', 'admin@grx10.com', 'damo@grx10.com'];
    if (superAdminEmails.includes(user.email.toLowerCase())) {
      await pool.query(
        `INSERT INTO ${SCHEMA_NAME}.platform_roles (user_id, role, created_at)
         VALUES ($1, 'super_admin', NOW())
         ON CONFLICT (user_id, role) DO NOTHING`,
        [user.id]
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      access_token: token,
      refresh_token: token,
      expires_in: 604800,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user from token
app.get('/auth/v1/user', authenticateToken, async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, email, created_at, raw_user_meta_data FROM auth.users WHERE id = $1',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    res.json({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      user_metadata: user.raw_user_meta_data || {}
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign out (just return success - JWT is stateless)
app.post('/auth/v1/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Signed out successfully' });
});

// Helper function to sync profile from Microsoft 365 data
async function syncProfileFromMS365(userId, fullName, jobTitle, department, phone, email, managerEmail) {
  try {
    // Look up the manager's profile_id by their email
    let managerId = null;
    if (managerEmail) {
      const { rows: managerProfiles } = await pool.query(
        `SELECT id FROM ${SCHEMA_NAME}.profiles WHERE email = $1 LIMIT 1`,
        [managerEmail.toLowerCase()]
      );
      managerId = managerProfiles[0]?.id || null;
    }

    // Update or create the user's profile with MS365 data
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    const { rows: existingProfiles } = await pool.query(
      `SELECT id FROM ${SCHEMA_NAME}.profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    const profileData = {
      full_name: fullName,
      email: email.toLowerCase(),
      job_title: jobTitle,
      department: department,
      phone: phone,
      manager_id: managerId,
      organization_id: defaultOrgId,
      updated_at: new Date().toISOString()
    };

    if (existingProfiles.length > 0) {
      // Update existing profile
      const updateFields = Object.keys(profileData).filter(k => profileData[k] !== null && k !== 'updated_at').map((k, i) => `${k} = $${i + 2}`).join(', ');
      const updateValues = Object.values(profileData).filter((v, i) => Object.keys(profileData)[i] !== 'updated_at' && v !== null);
      await pool.query(
        `UPDATE ${SCHEMA_NAME}.profiles SET ${updateFields}, updated_at = NOW() WHERE id = $1`,
        [existingProfiles[0].id, ...updateValues]
      );
    } else {
      // Create new profile
      await pool.query(
        `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, job_title, department, phone, manager_id, organization_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         job_title = EXCLUDED.job_title,
         department = EXCLUDED.department,
         phone = EXCLUDED.phone,
         manager_id = EXCLUDED.manager_id,
         organization_id = COALESCE(${SCHEMA_NAME}.profiles.organization_id, EXCLUDED.organization_id),
         updated_at = NOW()`,
        [userId, fullName, email.toLowerCase(), jobTitle, department, phone, managerId, defaultOrgId]
      );
    }
  } catch (err) {
    console.warn('Failed to sync profile from MS365:', err);
  }
}

// Microsoft 365 Authentication endpoint
app.post('/functions/v1/ms365-auth', async (req, res) => {
  try {
    console.log('[MS365 Auth] Request received:', { action: req.body.action, hasCode: !!req.body.code });
    const { action, code, redirect_uri } = req.body;

    // Validate Azure credentials are configured
    if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !AZURE_TENANT_ID) {
      console.error('[MS365 Auth] Missing Azure credentials');
      return res.status(500).json({ 
        error: 'Microsoft 365 authentication is not configured. Please set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID in environment variables.' 
      });
    }

    // Step 1: Generate the Azure AD authorization URL
    if (action === 'get_auth_url') {
      console.log('[MS365 Auth] Generating auth URL with redirect_uri:', redirect_uri);
      const crypto = require('crypto');
      const state = crypto.randomUUID();
      
      const authUrl = new URL(
        `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`
      );
      authUrl.searchParams.set('client_id', AZURE_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirect_uri);
      authUrl.searchParams.set('scope', 'openid profile email User.Read');
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('state', state);

      console.log('[MS365 Auth] Auth URL generated:', authUrl.toString());
      return res.json({ url: authUrl.toString(), state });
    }

    // Step 2: Exchange authorization code for tokens and sign in/up the user
    if (action === 'exchange_code') {
      console.log('[MS365 Auth] Exchanging code for tokens...');
      // Exchange code for tokens with Azure AD
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: AZURE_CLIENT_ID,
            client_secret: AZURE_CLIENT_SECRET,
            code,
            redirect_uri,
            grant_type: 'authorization_code',
            scope: 'openid profile email User.Read',
          }),
        }
      );

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Token exchange failed:', err);
        return res.status(400).json({ error: 'Token exchange failed' });
      }

      const tokens = await tokenRes.json();

      // Get user profile from Microsoft Graph
      const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!profileRes.ok) {
        return res.status(400).json({ error: 'Failed to fetch user profile' });
      }

      const profile = await profileRes.json();
      const email = profile.mail || profile.userPrincipalName;
      const fullName = profile.displayName || '';
      const jobTitle = profile.jobTitle || null;
      const department = profile.department || null;
      const phone = profile.businessPhones?.[0] || profile.mobilePhone || null;

      // Fetch manager info from MS365
      let managerEmail = null;
      try {
        const managerRes = await fetch('https://graph.microsoft.com/v1.0/me/manager', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (managerRes.ok) {
          const managerData = await managerRes.json();
          managerEmail = managerData.mail || managerData.userPrincipalName || null;
        }
      } catch (mgrErr) {
        console.warn('Could not fetch manager from MS365:', mgrErr);
      }

      console.log('[MS365 Auth] User profile from MS365:', { email, fullName, jobTitle, department });

      // Verify @grx10.com domain (security check)
      if (!email?.toLowerCase().endsWith('@grx10.com')) {
        console.log('[MS365 Auth] Rejected - not @grx10.com domain');
        return res.status(403).json({ error: 'Only @grx10.com accounts are allowed' });
      }

      // Check if user exists in auth.users
      console.log('[MS365 Auth] Checking if user exists...');
      const { rows: existingUsers } = await pool.query(
        'SELECT id, email FROM auth.users WHERE email = $1',
        [email.toLowerCase()]
      );

      let userId;
      let isNewUser = false;

      if (existingUsers.length > 0) {
        // Existing user - sign in
        userId = existingUsers[0].id;
      } else {
        // Create new user in auth.users (no password needed for OAuth users)
        const { rows: newUsers } = await pool.query(
          `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
           VALUES ($1, $2, NOW(), NOW(), NOW(), $3)
           RETURNING id`,
          [email.toLowerCase(), '', JSON.stringify({ full_name: fullName, provider: 'microsoft365' })]
        );
        userId = newUsers[0].id;
        isNewUser = true;

        // Assign role: admin for specific emails, employee for everyone else
        const adminEmails = ['sriram@grx10.com', 'nikita@grx10.com', 'anchal@grx10.com', 'admin@grx10.com'];
        const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'employee';
        const defaultOrgId = '00000000-0000-0000-0000-000000000001';
        await pool.query(
          `INSERT INTO ${SCHEMA_NAME}.user_roles (user_id, role, organization_id, created_at) 
           VALUES ($1, $2::${SCHEMA_NAME}.app_role, $3, NOW()) 
           ON CONFLICT (user_id, role, organization_id) DO NOTHING`,
          [userId, role, defaultOrgId]
        );
      }

      // Sync profile with MS365 data
      console.log('[MS365 Auth] Syncing profile...');
      await syncProfileFromMS365(userId, fullName, jobTitle, department, phone, email, managerEmail);

      // Generate JWT token for the user
      const token = jwt.sign(
        { id: userId, email: email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      console.log('[MS365 Auth] Authentication successful for:', email);
      // Return session compatible with frontend
      res.json({
        session: {
          access_token: token,
          refresh_token: token,
          expires_in: 604800,
          token_type: 'bearer',
          user: {
            id: userId,
            email: email,
            created_at: existingUsers[0]?.created_at || new Date().toISOString()
          }
        }
      });
      return;
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('[MS365 Auth] Error:', err);
    console.error('[MS365 Auth] Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
});

// Generic function endpoint (for other functions if needed)
app.post('/functions/v1/:functionName', (req, res) => {
  const { functionName } = req.params;
  
  if (functionName !== 'ms365-auth') {
    res.status(404).json({ 
      error: `Function '${functionName}' not found.` 
    });
  }
});

// RPC endpoint - execute stored procedures/functions
app.post('/rest/v1/rpc/:functionName', authenticateToken, async (req, res) => {
  const { functionName } = req.params;
  const params = req.body || {};

  try {
    console.log(`[RPC] Calling function: ${functionName}`, params);

    // Build the function call
    const paramKeys = Object.keys(params);
    const paramValues = Object.values(params);

    let query;
    if (paramKeys.length === 0) {
      query = `SELECT * FROM ${SCHEMA_NAME}.${functionName}()`;
    } else {
      const paramPlaceholders = paramKeys.map((key, i) => `${key} := $${i + 1}`).join(', ');
      query = `SELECT * FROM ${SCHEMA_NAME}.${functionName}(${paramPlaceholders})`;
    }

    console.log(`[RPC] Executing: ${query}`, paramValues);
    const result = await pool.query(query, paramValues);

    // Return the result - if it's a single row with a single column, return that value
    if (result.rows.length === 1 && Object.keys(result.rows[0]).length === 1) {
      const value = Object.values(result.rows[0])[0];
      res.json(value);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error(`[RPC] Error calling ${functionName}:`, error);
    res.status(500).json({
      message: error.message,
      details: error.detail || null,
      hint: error.hint || null,
      code: error.code || null
    });
  }
});

// Database Inspector endpoint
app.get('/api/db-inspector', authenticateToken, async (req, res) => {
  try {
    console.log('[DB Inspector] Fetching database structure...');

    // Get all tables in the grxbooks schema
    const tablesQuery = `
      SELECT
        t.table_name,
        t.table_schema as schema_name,
        (
          SELECT COUNT(*)
          FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        ) as column_count,
        COALESCE(s.n_live_tup, 0) as row_count,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) as estimated_size,
        pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)) as estimated_size_bytes,
        (
          SELECT COUNT(*)
          FROM pg_indexes i
          WHERE i.schemaname = t.table_schema AND i.tablename = t.table_name
        ) as index_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.table_schema AND s.relname = t.table_name
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
      ORDER BY row_count DESC
    `;

    const tablesResult = await pool.query(tablesQuery, [SCHEMA_NAME]);

    // Get columns for each table
    const tables = await Promise.all(tablesResult.rows.map(async (table) => {
      const columnsQuery = `
        SELECT
          column_name as name,
          data_type,
          is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `;
      const columnsResult = await pool.query(columnsQuery, [SCHEMA_NAME, table.table_name]);

      // Get primary keys
      const pkQuery = `
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
          AND i.indisprimary
      `;
      const pkResult = await pool.query(pkQuery, [SCHEMA_NAME, table.table_name]);

      // Get indexes
      const indexQuery = `
        SELECT
          indexname as index_name,
          indexdef as index_def
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2
      `;
      const indexResult = await pool.query(indexQuery, [SCHEMA_NAME, table.table_name]);

      return {
        ...table,
        row_count: parseInt(table.row_count) || 0,
        column_count: parseInt(table.column_count) || 0,
        index_count: parseInt(table.index_count) || 0,
        columns: columnsResult.rows,
        primary_keys: pkResult.rows.map(r => r.column_name),
        indexes: indexResult.rows,
      };
    }));

    // Get foreign key relationships
    const relationsQuery = `
      SELECT
        tc.constraint_name,
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name as target_table,
        ccu.column_name as target_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
      ORDER BY tc.table_name, tc.constraint_name
    `;
    const relationsResult = await pool.query(relationsQuery, [SCHEMA_NAME]);

    // Calculate health metrics
    const totalSize = await pool.query(`
      SELECT pg_size_pretty(SUM(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)))) as total_size,
             SUM(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) as total_size_bytes
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    `, [SCHEMA_NAME]);

    const health = {
      total_tables: tables.length,
      large_tables: tables.filter(t => t.row_count > 100000).map(t => ({
        table_name: t.table_name,
        row_count: t.row_count,
      })),
      tables_without_indexes: tables.filter(t => t.index_count === 0).map(t => t.table_name),
      total_size: totalSize.rows[0]?.total_size || '0 bytes',
      total_size_bytes: parseInt(totalSize.rows[0]?.total_size_bytes) || 0,
    };

    res.json({
      tables,
      relations: relationsResult.rows,
      health,
      inspected_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[DB Inspector] Error:', error);
    res.status(500).json({
      error: error.message,
      details: error.detail || null,
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', schema: SCHEMA_NAME });
});

// Create admin user endpoint (one-time setup)
app.post('/admin/create-user', async (req, res) => {
  try {
    const { email = 'admin@grx10.com', password = 'admin123', full_name = 'Admin User' } = req.body;

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id, email FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    let userId;
    let isNewUser = false;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`User ${email} already exists, updating...`);
      
      // Update password
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE auth.users SET encrypted_password = $1, email_confirmed_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
    } else {
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const { rows: newUsers } = await pool.query(
        `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
         VALUES ($1, $2, NOW(), NOW(), NOW(), $3)
         RETURNING id, email, created_at`,
        [email.toLowerCase(), hashedPassword, JSON.stringify({ full_name })]
      );
      userId = newUsers[0].id;
      isNewUser = true;
    }

    // Ensure profile exists (profiles table is in grxbooks schema)
    const { rows: profiles } = await pool.query(
      `SELECT id FROM ${SCHEMA_NAME}.profiles WHERE user_id = $1`,
      [userId]
    );

    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    if (profiles.length === 0) {
      await pool.query(
        `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, organization_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, full_name, email.toLowerCase(), defaultOrgId]
      );
    } else {
      await pool.query(
        `UPDATE ${SCHEMA_NAME}.profiles SET full_name = $1, email = $2, organization_id = COALESCE(organization_id, $4), updated_at = NOW() WHERE user_id = $3`,
        [full_name, email.toLowerCase(), userId, defaultOrgId]
      );
    }

    // Ensure user is a member of the default organization
    await pool.query(
      `INSERT INTO ${SCHEMA_NAME}.organization_members (organization_id, user_id, role, created_at)
       VALUES ($1, $2, 'member', NOW())
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [defaultOrgId, userId]
    );

    // Ensure admin role exists (user_roles table is in grxbooks schema, with default organization)
    await pool.query(
      `INSERT INTO ${SCHEMA_NAME}.user_roles (user_id, role, organization_id, created_at) 
       VALUES ($1, 'admin'::${SCHEMA_NAME}.app_role, $2, NOW()) 
       ON CONFLICT (user_id, role, organization_id) DO NOTHING`,
      [userId, defaultOrgId]
    );

    res.json({
      success: true,
      message: isNewUser ? 'Admin user created successfully' : 'Admin user updated successfully',
      user: {
        id: userId,
        email: email.toLowerCase(),
        full_name: full_name,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Create admin user error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend API Server running on http://localhost:${PORT}`);
  console.log(`📊 Connected to PostgreSQL database`);
  console.log(`📁 Using schema: ${SCHEMA_NAME}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await client.end();
  process.exit(0);
});
