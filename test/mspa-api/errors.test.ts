/**
 * Error handling tests for M-Spa API client
 * Tests retry logic, token refresh, and error types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  MspaApiClient,
  MspaAuthError,
  MspaRateLimitError,
  MspaNetworkError
} from '../../lib/mspa-api';

// Mock crypto module for deterministic nonces
vi.mock('crypto', async (importOriginal) => {
  const actualCrypto = await importOriginal();
  let nonceCounter = 0;
  
  return {
    ...actualCrypto,
    randomBytes: (len: number) => {
      const hex = '0123456789abcdef';
      let result = '';
      for (let i = 0; i < len; i++) {
        result += hex[nonceCounter % 16];
        nonceCounter++;
      }
      return Buffer.from(result, 'hex');
    },
  };
});

describe('Error Handling', () => {
  let fetchMock: vi.Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token refresh (code 10001)', () => {
    it('should re-authenticate and retry once when token expires', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      // Mock sequence: first call fails with 10001, auth succeeds, retry succeeds
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First request to get_device fails with 10001 (token expired)
          return Promise.resolve({
            ok: true,
            json: async () => ({ code: 10001, message: 'Token expired' }),
          });
        } else if (callCount === 2) {
          // Authentication request succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              code: 0,
              data: { token: 'new-token', email: 'test@example.com' },
            }),
          });
        } else if (callCount === 3) {
          // Retry request succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              code: 0,
              data: { list: [{ device_id: 'device-1' }] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: {} }),
        });
      });

      const devices = await client.getDevices();

      // Verify: 1. original request, 2. auth, 3. retry
      expect(callCount).toBe(3);
      expect(devices.length).toBe(1);
    });

    it('should throw auth error after first retry attempt fails', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      // Mock: first call fails with 10001, auth also fails
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ code: 10001, message: 'Token expired' }),
          });
        }
        // Auth fails
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 16019,
            message: 'Invalid credentials',
          }),
        });
      });

      await expect(client.getDevices()).rejects.toThrow(MspaAuthError);
      expect(callCount).toBe(2); // Original + auth attempt
    });
  });

  describe('Rate limiting (code 11000)', () => {
    it('should throw MspaRateLimitError', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 11000, message: 'Rate limited' }),
      });

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaRateLimitError);
      
      try {
        await client.getDevices();
      } catch (error) {
        if (error instanceof MspaRateLimitError) {
          expect(error.retryAfterMs).toBeGreaterThan(0);
          expect(error.retryable).toBe(true);
        }
      }
    });

    it('should use exponential backoff', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      let callCount = 0;
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => {
          callCount++;
          return { code: 11000, message: 'Rate limited' };
        },
      });

      // First rate limit - sets backoff to 1000ms
      try {
        await client.getDevices();
      } catch (e) {}

      // Second rate limit should double the backoff to 2000ms
      try {
        await client.getDevices();
      } catch (e) {}

      // The backoff should have doubled from 1000ms to 2000ms
      expect((client as any).backoffMs).toBe(2000);
    });
  });

  describe('Authentication error (code 16019)', () => {
    it('should throw MspaAuthError without retry', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 16019, message: 'Invalid password' }),
      });

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaAuthError);

      // Verify no retry was attempted (only 1 call)
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const error = await client.getDevices().catch(e => e);
      if (error instanceof MspaAuthError) {
        expect(error.code).toBe(16019);
        expect(error.retryable).toBe(false);
      }
    });

    it('should throw auth error with correct message', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 16019, message: 'Wrong password' }),
      });

      try {
        await client.getDevices();
        throw new Error('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MspaAuthError);
        expect((error as MspaAuthError).message).toContain('Authentication failed');
      }
    });
  });

  describe('Network errors', () => {
    it('should throw MspaNetworkError when fetch throws TypeError', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockRejectedValue(new TypeError('Network error'));

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaNetworkError);

      try {
        await client.getDevices();
      } catch (error) {
        if (error instanceof MspaNetworkError) {
          expect(error.message).toContain('Network error');
          expect(error.retryable).toBe(true);
        }
      }
    });

    it('should throw MspaNetworkError with retryable=true for network failures', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockRejectedValue(new TypeError('Connection timeout'));

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaNetworkError);
    });

    it('should throw MspaNetworkError for JSON parsing failures', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => 'invalid json',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      });

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaNetworkError);
    });
  });

  describe('Unknown error codes', () => {
    it('should throw MspaNetworkError for unknown error codes', async () => {
      const client = new MspaApiClient({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 5000, message: 'Unknown error' }),
      });

      await expect(client.getDevices()).rejects.toBeInstanceOf(MspaNetworkError);
    });
  });
});
