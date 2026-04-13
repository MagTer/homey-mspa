/**
 * Client tests for M-Spa API client
 * Tests all client methods with mocked fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MspaApiClient } from '../../lib/mspa-api/client.js';

// Mock crypto module to produce deterministic nonces for testing
vi.mock('crypto', async (importOriginal) => {
  const actualCrypto = await importOriginal();
  let nonceCounter = 0;
  
  return {
    ...actualCrypto,
    randomBytes: (len: number) => {
      // Return deterministic bytes based on nonceCounter
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

describe('MspaApiClient', () => {
  let fetchMock: vi.Mock;
  let client: MspaApiClient;

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    client = new MspaApiClient({
      email: 'test@example.com',
      password: 'password123',
      region: 'row',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should successfully authenticate and return token', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            token: 'test-token-123',
            email: 'test@example.com',
          },
        }),
      });

      const token = await client.authenticate();

      expect(token).toBe('test-token-123');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.iot.the-mspa.com/api/enduser/get_token/',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should send MD5-hashed password, not plaintext', async () => {
      const crypto = await import('crypto');
      const expectedPasswordHash = crypto
        .createHash('md5')
        .update('password123')
        .digest('hex');

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            token: 'test-token',
            email: 'test@example.com',
          },
        }),
      });

      await client.authenticate();

      const callArgs = fetchMock.mock.calls[0][1];
      const body = JSON.parse(callArgs.body as string);
      
      expect(body.password).toBe(expectedPasswordHash);
      expect(body.password).not.toBe('password123');
    });

    it('should store token for subsequent requests', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            token: 'stored-token',
            email: 'test@example.com',
          },
        }),
      });

      await client.authenticate();

      // Verify the client stored the token
      expect((client as any).token).toBe('stored-token');
    });
  });

  describe('getDevices', () => {
    it('should fetch devices list', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            list: [
              {
                device_id: 'device-1',
                product_id: 'product-1',
                product_series: 'MS-01',
                product_model: 'M-Spa',
                software_version: '1.0.0',
                wifi_version: '2.0.0',
                mcu_version: '3.0.0',
                device_alias: 'My Spa',
              },
            ],
          },
        }),
      });

      const devices = await client.getDevices();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.iot.the-mspa.com/api/enduser/devices/',
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(devices.length).toBe(1);
      expect(devices[0].device_id).toBe('device-1');
    });
  });

  describe('getThingShadow', () => {
    it('should fetch device shadow', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            water_temperature: 76,
            temperature_setting: 80,
            heater_state: 1,
            filter_state: 0,
            bubble_state: 1,
            bubble_level: 2,
            uvc_state: 0,
            ozone_state: 1,
            jet_state: 0,
            fault: '',
          },
        }),
      });

      const shadow = await client.getThingShadow('device-1', 'product-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.iot.the-mspa.com/api/device/thing_shadow/',
        expect.objectContaining({
          method: 'POST',
        })
      );
      
      const callArgs = fetchMock.mock.calls[0][1];
      const body = JSON.parse(callArgs.body as string);
      expect(body.device_id).toBe('device-1');
      expect(body.product_id).toBe('product-1');
    });
  });

  describe('sendCommand', () => {
    it('should send command with desired as JSON string', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {},
        }),
      });

      const desired = {
        heater_state: 1,
        bubble_level: 2,
      };

      await client.sendCommand('device-1', 'product-1', desired);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.iot.the-mspa.com/api/device/command',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const callArgs = fetchMock.mock.calls[0][1];
      const body = JSON.parse(callArgs.body as string);
      
      // desired should be a JSON string
      expect(typeof body.desired).toBe('string');
      
      // Parsing it should give us the nested object
      const parsedDesired = JSON.parse(body.desired);
      expect(parsedDesired).toHaveProperty('state');
      expect(parsedDesired.state).toHaveProperty('desired');
      expect(parsedDesired.state.desired).toEqual(desired);
    });
  });
});
