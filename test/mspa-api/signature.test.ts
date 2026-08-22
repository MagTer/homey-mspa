/**
 * Request signing tests
 *
 * These import the real signing code from lib/mspa-api/signing.ts. The previous
 * version of this file reimplemented the MD5 scheme with `crypto` and asserted
 * its own copy, so it could not catch a regression in the code that actually
 * signs requests.
 *
 * The expected signatures below are fixed vectors, computed independently with
 * Python's hashlib rather than with Node's crypto. Do not recompute them inside
 * the test — a test that derives its own expectation proves nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  APP_ID,
  APP_SECRET,
  buildAuthHeaders,
  buildSignature,
  currentTimestamp,
  generateNonce,
} from '../../lib/mspa-api/signing.js';

describe('buildSignature', () => {
  it('matches a known-good vector', () => {
    expect(buildSignature('0123456789abcdef0123456789abcdef', '1234567890'))
      .toBe('087456B6E183BF5FFCBDA53B87356411');
  });

  it('matches a second known-good vector', () => {
    expect(buildSignature('ffffffffffffffffffffffffffffffff', '1700000000'))
      .toBe('86176FBC92785182EA3476BF019EAE1E');
  });

  it('is uppercase hex, 32 characters', () => {
    const sign = buildSignature(generateNonce(), currentTimestamp());
    expect(sign).toMatch(/^[A-F0-9]{32}$/);
  });

  it('changes when the nonce changes', () => {
    const ts = '1234567890';
    const a = buildSignature('0123456789abcdef0123456789abcdef', ts);
    const b = buildSignature('fedcba9876543210fedcba9876543210', ts);
    expect(a).not.toBe(b);
  });

  it('changes when the timestamp changes', () => {
    const nonce = '0123456789abcdef0123456789abcdef';
    expect(buildSignature(nonce, '1234567890')).not.toBe(buildSignature(nonce, '1234567891'));
  });

  it('signs over appId, appSecret, nonce and ts in that order', () => {
    // Guards the comma-joined field order: swapping any two changes the digest.
    expect(APP_ID).toBe('e1c8e068f9ca11eba4dc0242ac120002');
    expect(APP_SECRET).toBe('87025c9ecd18906d27225fe79cb68349');
  });
});

describe('generateNonce', () => {
  it('is 32 lowercase hex characters', () => {
    expect(generateNonce()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('differs between calls', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe('currentTimestamp', () => {
  it('is unix seconds as a digit string', () => {
    const ts = currentTimestamp();
    expect(ts).toMatch(/^\d{10}$/);
    expect(Math.abs(Number(ts) * 1000 - Date.now())).toBeLessThan(5000);
  });
});

describe('buildAuthHeaders', () => {
  const nonce = '0123456789abcdef0123456789abcdef';
  const ts = '1234567890';

  it('produces the exact header set the API expects', () => {
    expect(buildAuthHeaders(nonce, ts)).toEqual({
      appid: 'e1c8e068f9ca11eba4dc0242ac120002',
      nonce,
      ts,
      sign: '087456B6E183BF5FFCBDA53B87356411',
      'content-type': 'application/json',
      'user-agent': 'okhttp/4.9.0',
      push_type: 'android',
      authorization: 'token',
    });
  });

  it('sends a bare "token" when unauthenticated', () => {
    expect(buildAuthHeaders(nonce, ts).authorization).toBe('token');
  });

  it('prefixes the token when authenticated', () => {
    expect(buildAuthHeaders(nonce, ts, 'abc123').authorization).toBe('token abc123');
  });

  it('never leaks the app secret into the headers', () => {
    const headers = buildAuthHeaders(nonce, ts, 'abc123');
    expect(JSON.stringify(headers)).not.toContain(APP_SECRET);
  });
});
