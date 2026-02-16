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
const { logSystemFlags } = require('./config/systemFlags');

// Import routes
const authRoutes = require('./auth/auth.routes');
const bookRoutes = require('./modules/books/book.routes');
const authorRoutes = require('./modules/authors/author.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const userRoutes = require('./modules/users/user.routes');
const securityRoutes = require('./modules/security/security.routes');
const devRoutes = require('./modules/dev/dev.routes');

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
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
    
    // Sync models (create tables if they don't exist)
    // Use force: false to avoid dropping existing tables
    // Use alter: false to avoid trying to modify existing schemas
    await sequelize.sync({ force: false, alter: false });
    console.log('✓ Database models synchronized');
    
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
