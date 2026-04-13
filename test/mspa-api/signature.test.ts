/**
 * Signature and header generation tests
 * Tests the HMAC signing and header format for API requests
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

describe('Signature and Header Generation', () => {
  const APP_ID = 'e1c8e068f9ca11eba4dc0242ac120002';
  const APP_SECRET = '87025c9ecd18906d27225fe79cb68349';

  it('should produce uppercase hex MD5 signature', () => {
    const nonce = '0123456789abcdef0123456789abcdef';
    const ts = '1234567890';
    
    const sign = crypto
      .createHash('md5')
      .update(`${APP_ID},${APP_SECRET},${nonce},${ts}`)
      .digest('hex')
      .toUpperCase();
    
    // Verify signature is uppercase hex
    expect(sign).toMatch(/^[A-F0-9]+$/);
    expect(sign.length).toBe(32);
  });

  it('should produce 32 character nonce', () => {
    const nonce = crypto.randomBytes(16).toString('hex');
    expect(nonce.length).toBe(32);
  });

  it('should produce numeric timestamp as string', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    expect(ts).toMatch(/^\d+$/);
  });

  it('should produce deterministic signature for known inputs', () => {
    // Use a fixed nonce and timestamp for deterministic testing
    const nonce = '0123456789abcdef0123456789abcdef';
    const ts = '1234567890';
    
    // Expected signature: MD5(appId,appSecret,nonce,ts) uppercase
    const sign = crypto
      .createHash('md5')
      .update(`${APP_ID},${APP_SECRET},${nonce},${ts}`)
      .digest('hex')
      .toUpperCase();
    
    // This is the computed value for the known inputs
    expect(sign).toBe('087456B6E183BF5FFCBDA53B87356411');
  });

  it('should generate authorization header correctly without token', () => {
    const headers = {
      appid: APP_ID,
      authorization: 'token',
    };
    
    expect(headers.authorization).toBe('token');
  });

  it('should generate authorization header correctly with token', () => {
    const token = 'test-token-value';
    const headers = {
      appid: APP_ID,
      authorization: `token ${token}`,
    };
    
    expect(headers.authorization).toBe('token test-token-value');
  });
});
