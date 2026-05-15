/**
 * Tests for DevMode system flags
 */

import { describe, it, expect } from 'vitest';
import { DEV_MODE, ALLOW_PERMISSION_EDITING, getSystemFlags } from '@/config/systemFlags';

describe('System Flags', () => {
  it('should export DEV_MODE flag', () => {
    expect(typeof DEV_MODE).toBe('boolean');
  });
  
  it('should export ALLOW_PERMISSION_EDITING flag', () => {
    expect(typeof ALLOW_PERMISSION_EDITING).toBe('boolean');
  });
  
  it('should return system flags from getSystemFlags', () => {
    const flags = getSystemFlags();
    
    expect(flags).toHaveProperty('DEV_MODE');
    expect(flags).toHaveProperty('ALLOW_PERMISSION_EDITING');
    expect(flags).toHaveProperty('NODE_ENV');
    expect(flags).toHaveProperty('isProduction');
  });
  
  it('should set flags correctly in development mode', () => {
    const flags = getSystemFlags();

    // Flags follow VITE_DEV_MODE / VITE_ALLOW_PERMISSION_EDITING env overrides
    // (see .env). When unset they default to true in non-prod.
    if (!flags.isProduction) {
      const expectedDev = import.meta.env.VITE_DEV_MODE !== 'false';
      const expectedPerm = import.meta.env.VITE_ALLOW_PERMISSION_EDITING !== 'false';
      expect(flags.DEV_MODE).toBe(expectedDev);
      expect(flags.ALLOW_PERMISSION_EDITING).toBe(expectedPerm);
    }
  });
});
