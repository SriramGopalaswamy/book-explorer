const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
require('dotenv').config();

const { sequelize } = require('./config/database');
const models = require('./modules'); // Load all models with associations
const passport = require('./auth/strategies');
const demoModeMiddleware = require('./auth/middleware/demoMode');
const { resolveEffectiveRole } = require('./auth/middleware/resolveEffectiveRole');
const { developerBypass } = require('./auth/middleware/developerBypass');
const { logSystemFlags } = require('./config/systemFlags');

// Import routes
const authRoutes = require('./auth/auth.routes');
const bookRoutes = require('./modules/books/book.routes');
const authorRoutes = require('./modules/authors/author.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const userRoutes = require('./modules/users/user.routes');
const securityRoutes = require('./modules/security/security.routes');
const devRoutes = require('./modules/dev/dev.routes');
const financialRoutes = require('./modules/financial/financial.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  }
}));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:8080', // Vite alternate port
    'http://localhost:5174', // Another common Vite port
  ],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error('ERROR: SESSION_SECRET environment variable is not set!');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  console.warn('WARNING: Using default session secret for development only');
}

app.use(session({
  secret: sessionSecret || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Developer bypass middleware (MUST come BEFORE passport auth check)
// Allows bypassing authentication in developer mode
app.use(developerBypass);

// Resolve effective role (for dev mode impersonation)
// Must come AFTER passport initialization
app.use(resolveEffectiveRole);

// CSRF protection (only for mutation routes, not for API reads)
const csrfProtection = csrf({ cookie: true });

// Demo mode middleware (applies to all routes)
app.use(demoModeMiddleware);

// Health check (no CSRF needed for GET)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    demoMode: process.env.DEMO_MODE === 'true',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/authors', authorRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/financial', financialRoutes);

// CSRF token endpoint for clients
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Serve static files from React build
const frontendBuildPath = path.join(__dirname, '../../dist');
app.use(express.static(frontendBuildPath));

// Serve React app for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Database initialization and server start
const startServer = async () => {
  try {
    // Log system flags
    logSystemFlags();
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');
    
    // STEP 4: VERIFY DB CONNECTION CONTEXT
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 4: DATABASE CONNECTION VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ACTIVE DB:', process.env.DATABASE_URL || sequelize.options.storage);
    console.log('DB Dialect:', sequelize.options.dialect);
    console.log('DB Storage:', sequelize.options.storage);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Sync models (create tables if they don't exist)
    // Use force: false to avoid dropping existing tables
    // Use alter: false to avoid trying to modify existing schemas
    await sequelize.sync({ force: false, alter: false });
    console.log('✓ Database models synchronized');
    
    // STEP 1: VERIFY DATABASE CONTENT (ABSOLUTE TRUTH)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 1: DATABASE ROLES VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
      const roles = await models.Role.findAll({
        attributes: ['id', 'name', 'isActive', 'permissions'],
        order: [['name', 'ASC']]
      });
      console.log('DB ROLES:', JSON.stringify(roles, null, 2));
      console.log('DB ROLES COUNT:', roles.length);
      
      if (roles.length === 0) {
        console.error('❌ WARNING: roles.length === 0');
        console.error('❌ Seeding failed or not run. Database has no roles!');
      } else {
        console.log('✓ Roles exist in database');
        roles.forEach(role => {
          console.log(`  - ${role.name} (ID: ${role.id}, Active: ${role.isActive}, Permissions: ${role.permissions?.length || 0})`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to query roles table:', error.message);
    }
    
    // STEP 2: VERIFY ROLE-PERMISSION LINKAGE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 2: ROLE-PERMISSION LINKAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
      const permissionsCount = await models.Permission.count();
      console.log('PERMISSIONS COUNT:', permissionsCount);
      
      if (permissionsCount === 0) {
        console.error('❌ WARNING: No permissions in database');
        console.error('❌ Seeding incomplete');
      } else {
        console.log('✓ Permissions exist in database');
      }
    } catch (error) {
      console.error('❌ Failed to query permissions table:', error.message);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Demo mode: ${process.env.DEMO_MODE === 'true' ? 'enabled' : 'disabled'}`);
      console.log(`✓ API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
