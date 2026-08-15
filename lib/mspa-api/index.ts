/**
 * M-Spa API Client Module
 * Standalone API client for M-Spa cloud API with authentication, throttling, and error handling
 */

export { MspaApiClient } from './client.js';
export { isActivelyHeating, parseShadow } from './shadow.js';
export { MspaThrottle } from './throttle.js';

export * from './types.js';
export * from './errors.js';
export * from './profiles.js';
