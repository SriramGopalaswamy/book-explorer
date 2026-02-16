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
    
    // In test mode (which is development), these should be true by default
    if (!flags.isProduction) {
      expect(flags.DEV_MODE).toBe(true);
      expect(flags.ALLOW_PERMISSION_EDITING).toBe(true);
    }
  });
});
