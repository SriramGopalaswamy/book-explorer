/**
 * Tests for API client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setCustomHeader, removeCustomHeader, getCustomHeaders } from '@/lib/api';

describe('API Client', () => {
  beforeEach(() => {
    // Clean up headers before each test
    const headers = getCustomHeaders();
    Object.keys(headers).forEach(key => removeCustomHeader(key));
  });
  
  it('should set custom header', () => {
    setCustomHeader('x-test-header', 'test-value');
    const headers = getCustomHeaders();
    
    expect(headers['x-test-header']).toBe('test-value');
  });
  
  it('should remove custom header', () => {
    setCustomHeader('x-test-header', 'test-value');
    removeCustomHeader('x-test-header');
    const headers = getCustomHeaders();
    
    expect(headers['x-test-header']).toBeUndefined();
  });
  
  it('should handle multiple headers', () => {
    setCustomHeader('x-header-1', 'value-1');
    setCustomHeader('x-header-2', 'value-2');
    const headers = getCustomHeaders();
    
    expect(headers['x-header-1']).toBe('value-1');
    expect(headers['x-header-2']).toBe('value-2');
  });
  
  it('should get all custom headers as new object', () => {
    setCustomHeader('x-test', 'test');
    const headers1 = getCustomHeaders();
    const headers2 = getCustomHeaders();
    
    // Should return different objects (not the same reference)
    expect(headers1).not.toBe(headers2);
    expect(headers1).toEqual(headers2);
  });
});
