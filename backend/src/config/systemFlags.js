/**
 * System-level flags for developer mode and governance
 * Controls RBAC introspection and permission editing capabilities
 */

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * DEV_MODE - Controls developer tools visibility and features
 * - Default: true in development
 * - Forced: false in production
 * - Enables: Role impersonation, permission matrix debugging, live governance
 */
const DEV_MODE = isProduction ? false : (process.env.DEV_MODE !== 'false');

/**
 * ALLOW_PERMISSION_EDITING - Controls runtime permission modification
 * - Default: true in development
 * - Forced: false in production
 * - Requires: SuperAdmin role
 * - Audited: All changes logged
 */
const ALLOW_PERMISSION_EDITING = isProduction ? false : (process.env.ALLOW_PERMISSION_EDITING !== 'false');

/**
 * Get all system flags
 */
const getSystemFlags = () => ({
  DEV_MODE,
  ALLOW_PERMISSION_EDITING,
  NODE_ENV,
  isProduction
});

/**
 * Log system flags on initialization
 */
const logSystemFlags = () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SYSTEM FLAGS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Environment:             ${NODE_ENV}`);
  console.log(`Production:              ${isProduction}`);
  console.log(`Developer Mode:          ${DEV_MODE ? '✓ ENABLED' : '✗ DISABLED'}`);
  console.log(`Permission Editing:      ${ALLOW_PERMISSION_EDITING ? '✓ ENABLED' : '✗ DISABLED'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (isProduction && (DEV_MODE || ALLOW_PERMISSION_EDITING)) {
    console.error('⚠️  WARNING: Developer tools should be disabled in production!');
  }
};

module.exports = {
  DEV_MODE,
  ALLOW_PERMISSION_EDITING,
  NODE_ENV,
  isProduction,
  getSystemFlags,
  logSystemFlags
};
