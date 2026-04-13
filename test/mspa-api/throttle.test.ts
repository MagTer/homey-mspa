/**
 * Throttle tests for M-Spa API client
 * Tests the 0.4s minimum interval between API calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MspaThrottle } from '../../lib/mspa-api/throttle.js';

describe('MspaThrottle', () => {
  let throttle: MspaThrottle;

  beforeEach(() => {
    throttle = new MspaThrottle();
  });

  it('should acquire immediately when no prior call exists', async () => {
    const startTime = Date.now();
    await throttle.acquire();
    const elapsed = Date.now() - startTime;
    
    // First call should complete immediately (less than 50ms)
    expect(elapsed).toBeLessThan(50);
  });

  it('should enforce 0.4s minimum interval between consecutive calls', async () => {
    // First acquire - should complete immediately
    await throttle.acquire();
    
    const startTime = Date.now();
    
    // Second acquire - should delay by at least 400ms
    await throttle.acquire();
    
    const elapsed = Date.now() - startTime;
    
    // The second call should have added at least 400ms
    // Allow some tolerance for test overhead
    expect(elapsed).toBeGreaterThanOrEqual(350);
  }, 10000);

  it('should not add delay when sufficient time has passed', async () => {
    // First acquire
    await throttle.acquire();
    
    // Wait 500ms (more than the 400ms minimum)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const startTime = Date.now();
    
    // Second acquire - should not need additional delay
    await throttle.acquire();
    
    const elapsed = Date.now() - startTime;
    
    // Elapsed should be small (less than 100ms)
    expect(elapsed).toBeLessThan(100);
  });

  it('should handle concurrent acquire calls', async () => {
    const startTime = Date.now();
    
    // Start two concurrent acquires
    const promises = [throttle.acquire(), throttle.acquire()];
    
    // Wait for both to complete
    await Promise.all(promises);
    
    // Both should have been serialized, so total time should be ~400ms
    const elapsed = Date.now() - startTime;
    
    // Elapsed should be around 400ms (with tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(350);
    expect(elapsed).toBeLessThan(600);
  }, 10000);

  it('should reset state between instances', () => {
    const throttle1 = new MspaThrottle();
    const throttle2 = new MspaThrottle();
    
    // Both should start with no pending state
    expect((throttle1 as any).lastCall).toBe(0);
    expect((throttle2 as any).lastCall).toBe(0);
    expect((throttle1 as any).pending).toBeNull();
    expect((throttle2 as any).pending).toBeNull();
  });
});
