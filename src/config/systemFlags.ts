/**
 * System-level flags for developer mode and governance
 * Controls RBAC introspection and permission editing capabilities
 */

const NODE_ENV = import.meta.env.MODE || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * DEV_MODE - Controls developer tools visibility and features
 * - Default: true in development
 * - Forced: false in production
 * - Enables: Role impersonation, permission matrix debugging, live governance
 */
export const DEV_MODE = isProduction ? false : (import.meta.env.VITE_DEV_MODE !== 'false');

/**
 * ALLOW_PERMISSION_EDITING - Controls runtime permission modification
 * - Default: true in development
 * - Forced: false in production
 * - Requires: SuperAdmin role
 * - Audited: All changes logged
 */
export const ALLOW_PERMISSION_EDITING = isProduction ? false : (import.meta.env.VITE_ALLOW_PERMISSION_EDITING !== 'false');

/**
 * Get all system flags
 */
export const getSystemFlags = () => ({
  DEV_MODE,
  ALLOW_PERMISSION_EDITING,
  NODE_ENV,
  isProduction
});

/**
 * Log system flags on initialization
 */
export const logSystemFlags = () => {
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
