/**
 * System-level flags for developer mode and governance
 * Controls RBAC introspection and permission editing capabilities
 */

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * DEV_MODE - Controls developer tools visibility and features
 * - Default: true in development, false in production
 * - Can be explicitly enabled in production via DEV_MODE=true
 * - Enables: Role impersonation, permission matrix debugging, live governance
 */
const DEV_MODE = process.env.DEV_MODE === 'true' || (!isProduction && process.env.DEV_MODE !== 'false');

/**
 * ALLOW_PERMISSION_EDITING - Controls runtime permission modification
 * - Default: true in development, false in production
 * - Can be explicitly enabled in production via ALLOW_PERMISSION_EDITING=true
 * - Requires: SuperAdmin role
 * - Audited: All changes logged
 */
const ALLOW_PERMISSION_EDITING = process.env.ALLOW_PERMISSION_EDITING === 'true' || (!isProduction && process.env.ALLOW_PERMISSION_EDITING !== 'false');

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
