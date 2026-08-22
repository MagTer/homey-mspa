/**
 * M-Spa request signing
 *
 * Extracted from the client so the scheme itself is testable. The previous
 * signature test reimplemented MD5 signing with `crypto` and asserted its own
 * copy, so a regression in the real code passed green. These functions are the
 * ones the client actually calls.
 *
 * A wrong signature locks every user out of their spa, so the tests assert
 * fixed known-good vectors rather than recomputing the expected value.
 */

import * as crypto from 'node:crypto';

/** Hardcoded credentials, as per the M-Spa API spec. */
export const APP_ID = 'e1c8e068f9ca11eba4dc0242ac120002';
export const APP_SECRET = '87025c9ecd18906d27225fe79cb68349';

/** MD5(appId,appSecret,nonce,ts) as uppercase hex. */
export function buildSignature(nonce: string, ts: string): string {
  return crypto
    .createHash('md5')
    .update(`${APP_ID},${APP_SECRET},${nonce},${ts}`)
    .digest('hex')
    .toUpperCase();
}

/** 32-character lowercase hex nonce. */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Unix seconds as a string. */
export function currentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * The exact header set sent with every request. [nonce] and [ts] are injected
 * so tests can pin them; the client passes freshly generated values.
 */
export function buildAuthHeaders(
  nonce: string,
  ts: string,
  token?: string,
): Record<string, string> {
  return {
    appid: APP_ID,
    nonce,
    ts,
    sign: buildSignature(nonce, ts),
    'content-type': 'application/json',
    'user-agent': 'okhttp/4.9.0',
    'push_type': 'android',
    authorization: token ? `token ${token}` : 'token',
  };
}
