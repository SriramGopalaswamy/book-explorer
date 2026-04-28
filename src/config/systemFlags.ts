/**
 * System-level flags for developer mode and governance
 * Controls RBAC introspection and permission editing capabilities
 */

const NODE_ENV = import.meta.env.MODE || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * DEV_MODE - Controls developer tools visibility and features
 * SECURITY: Hard-coded OFF in production builds. Vite sets MODE='production'
 * for all `npm run build` output; no env var can override this.
 * Enables: Role impersonation, permission matrix debugging, live governance.
 */
export const DEV_MODE = !isProduction && import.meta.env.VITE_DEV_MODE !== 'false';

/**
 * ALLOW_PERMISSION_EDITING - Controls runtime permission modification
 * SECURITY: Hard-coded OFF in production builds (same guarantee as DEV_MODE).
 * Requires: SuperAdmin role. Audited: All changes logged.
 */
export const ALLOW_PERMISSION_EDITING = !isProduction && import.meta.env.VITE_ALLOW_PERMISSION_EDITING !== 'false';

/**
 * AI_CHAT_ENABLED - DECOMMISSIONED
 * Chatbot has been permanently removed and replaced by Financial Risk Monitor.
 * Kept as false constant for backward compatibility with any remaining references.
 */
export const AI_CHAT_ENABLED = false;

/**
 * AI_ANALYTICS_ENABLED - DECOMMISSIONED
 * LLM-based analytics have been permanently replaced by structured Financial Control Center.
 * Kept as false constant for backward compatibility with any remaining references.
 */
export const AI_ANALYTICS_ENABLED = false;

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
  console.log(`AI Chat:                 ✗ DECOMMISSIONED`);
  console.log(`AI Analytics:            ✗ DECOMMISSIONED → Financial Risk Monitor`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (isProduction && (DEV_MODE || ALLOW_PERMISSION_EDITING)) {
    console.error('⚠️  WARNING: Developer tools should be disabled in production!');
  }
};
