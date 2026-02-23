/**
 * System-level flags for developer mode and governance
 * Controls RBAC introspection and permission editing capabilities
 */

const NODE_ENV = import.meta.env.MODE || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * DEV_MODE - Controls developer tools visibility and features
 * - Default: true in development, false in production
 * - Can be explicitly enabled in production via VITE_DEV_MODE=true
 * - Enables: Role impersonation, permission matrix debugging, live governance
 */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true' || (!isProduction && import.meta.env.VITE_DEV_MODE !== 'false');

/**
 * ALLOW_PERMISSION_EDITING - Controls runtime permission modification
 * - Default: true in development, false in production
 * - Can be explicitly enabled in production via VITE_ALLOW_PERMISSION_EDITING=true
 * - Requires: SuperAdmin role
 * - Audited: All changes logged
 */
export const ALLOW_PERMISSION_EDITING = import.meta.env.VITE_ALLOW_PERMISSION_EDITING === 'true' || (!isProduction && import.meta.env.VITE_ALLOW_PERMISSION_EDITING !== 'false');

/**
 * AI_CHAT_ENABLED - Controls the floating AI chat assistant
 * Phase 1 soft decommission: set to false to hide chatbot UI
 */
export const AI_CHAT_ENABLED = import.meta.env.VITE_AI_CHAT_ENABLED === 'true' ? true : false;

/**
 * AI_ANALYTICS_ENABLED - Controls AI insight widgets and module insight bars
 * Phase 1 soft decommission: set to false to disable AI analytics
 */
export const AI_ANALYTICS_ENABLED = import.meta.env.VITE_AI_ANALYTICS_ENABLED === 'true' ? true : false;

/**
 * Get all system flags
 */
export const getSystemFlags = () => ({
  DEV_MODE,
  ALLOW_PERMISSION_EDITING,
  AI_CHAT_ENABLED,
  AI_ANALYTICS_ENABLED,
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
  console.log(`AI Chat:                 ${AI_CHAT_ENABLED ? '✓ ENABLED' : '✗ DISABLED'}`);
  console.log(`AI Analytics:            ${AI_ANALYTICS_ENABLED ? '✓ ENABLED' : '✗ DISABLED'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (isProduction && (DEV_MODE || ALLOW_PERMISSION_EDITING)) {
    console.error('⚠️  WARNING: Developer tools should be disabled in production!');
  }
};
