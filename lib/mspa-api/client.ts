/**
 * M-Spa API Client
 * Provides authentication, device management, and shadow/command operations
 */

import * as crypto from 'node:crypto';
import { MspaThrottle } from './throttle.js';
import {
  APP_ID,
  buildAuthHeaders,
  currentTimestamp,
  generateNonce,
} from './signing.js';
import { MspaAuthError, MspaNetworkError, MspaRateLimitError } from './errors.js';
import { ApiResponse, DeviceInfo, MspaClientConfig, RawShadowData } from './types.js';

/** Base URL mapping per region */
const REGION_URLS: Record<string, string> = {
  row: 'https://api.iot.the-mspa.com',
  us: 'https://api.usiot.the-mspa.com',
  ch: 'https://api.mspa.mxchip.com.cn',
};

export class MspaApiClient {
  private readonly email: string;
  private readonly passwordHash: string;
  private readonly region: string;
  private readonly baseUrl: string;
  private readonly throttle: MspaThrottle;

  // Token state
  private token: string | null = null;

  // Backoff state
  private backoffMs: number = 0;
  private readonly maxBackoff: number = 60000;

  // Retry flag to prevent infinite re-auth loops
  private isRetrying = false;

  constructor(config: MspaClientConfig) {
    this.email = config.email;
    
    // Use passwordHash directly if provided, otherwise hash the password
    if (config.passwordHash) {
      this.passwordHash = config.passwordHash;
    } else if (config.password) {
      this.passwordHash = crypto.createHash('md5').update(config.password).digest('hex');
    } else {
      throw new Error('Either password or passwordHash must be provided');
    }
    
    this.region = config.region;
    this.baseUrl = REGION_URLS[config.region];
    if (!this.baseUrl) {
      throw new Error(`Unknown region: ${config.region}`);
    }
    this.throttle = new MspaThrottle();
  }

  /**
   * Generate authentication headers for API requests
   */
  private generateHeaders(token?: string): Record<string, string> {
    return buildAuthHeaders(generateNonce(), currentTimestamp(), token);
  }

  /**
   * Perform an authenticated API request with retry and backoff logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    tokenOverride?: string
  ): Promise<ApiResponse<T>> {
    // Acquire throttle lock
    await this.throttle.acquire();

    // Check for backoff and wait if needed
    if (this.backoffMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, this.backoffMs));
    }
    
    const backoffUsed = this.backoffMs;
    this.backoffMs = 0;

    const url = `${this.baseUrl}${path}`;
    const headers = this.generateHeaders(tokenOverride || (this.token ?? undefined));
    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      let data: ApiResponse<T>;
      try {
        data = await response.json();
      } catch (e) {
        throw new MspaNetworkError(`Failed to parse JSON response: ${(e as Error).message}`, response.status);
      }

      // Handle API error codes
      if (data.code !== undefined && data.code !== 0) {
        switch (data.code) {
          case 10001:
            // Token expired - re-authenticate and retry once
            if (!this.isRetrying) {
              this.isRetrying = true;
              try {
                this.token = await this.authenticate();
                this.isRetrying = false;
                // Retry the request with new token
                return this.request(method, path, body, this.token);
              } catch (authError) {
                this.isRetrying = false;
                throw authError;
              }
            }
            // Already retried once, throw error
            throw new MspaAuthError(`Authentication required: ${data.message || 'Token expired'}`, 10001);
          case 11000:
            // Rate limited - use backoff
            // Use the backoff that was just consumed for doubling calculation
            this.backoffMs = Math.min(Math.max(backoffUsed * 2, 1000), this.maxBackoff);
            throw new MspaRateLimitError(this.backoffMs);
          case 16019:
            // Authentication error - don't retry
            throw new MspaAuthError(`Authentication failed: ${data.message || 'Invalid credentials'}`, 16019);
          default:
            // Other error codes
            throw new MspaNetworkError(`API error ${data.code}: ${data.message || 'Unknown error'}`, data.code);
        }
      }

      // Success - reset backoff
      this.backoffMs = 0;

      return data;
    } catch (error) {
      // Reset retry flag on network errors
      this.isRetrying = false;

      if (error instanceof MspaAuthError || error instanceof MspaRateLimitError || error instanceof MspaNetworkError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new MspaNetworkError('Request timeout', 408);
      }

      // Network error (fetch threw)
      throw new MspaNetworkError(`Network error: ${(error as Error).message}`);
    }
  }

  /**
   * Authenticate with the M-Spa API
   * @returns The authentication token
   */
  async authenticate(): Promise<string> {
    const response = await this.request<{
      token: string;
      email: string;
    }>('POST', '/api/enduser/get_token/', {
      account: this.email,
      email: this.email,
      password: this.passwordHash,
      app_id: APP_ID,
      push_type: 'android',
    });

    if (!response.data.token) {
      throw new MspaAuthError('Authentication failed: no token returned', 16019);
    }

    this.token = response.data.token;
    return this.token;
  }

  /**
   * Get list of devices associated with the account
   * @returns Array of device information
   */
  async getDevices(): Promise<DeviceInfo[]> {
    const response = await this.request<{
      list: DeviceInfo[];
    }>('GET', '/api/enduser/devices/');

    return response.data.list || [];
  }

  /**
   * Get the shadow (current state) of a device
   * @param deviceId The device ID
   * @param productId The product ID
   * @returns Raw shadow data
   */
  async getThingShadow(deviceId: string, productId: string): Promise<RawShadowData> {
    const response = await this.request<RawShadowData>('POST', '/api/device/thing_shadow/', {
      device_id: deviceId,
      product_id: productId,
    });

    return response.data;
  }

  /**
   * Send a command to a device
   * @param deviceId The device ID
   * @param productId The product ID
   * @param desired Desired state values
   */
  async sendCommand(
    deviceId: string,
    productId: string,
    desired: Record<string, unknown>
  ): Promise<void> {
    await this.request<Record<string, unknown>>(
      'POST',
      '/api/device/command',
      {
        device_id: deviceId,
        product_id: productId,
        desired: JSON.stringify({ state: { desired } }),
      }
    );
  }
}
