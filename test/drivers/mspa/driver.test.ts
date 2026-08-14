import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure variables are available to vi.mock
const { mockClientClass, mockFlowCards } = vi.hoisted(() => {
  const mockFlowCards = {
    conditions: {
      heater_is_active: { registerRunListener: vi.fn() },
      filter_is_active: { registerRunListener: vi.fn() },
      temperature_above: { registerRunListener: vi.fn() },
      temperature_below: { registerRunListener: vi.fn() },
      temperature_equals: { registerRunListener: vi.fn() },
      jets_is_active: { registerRunListener: vi.fn() },
      ozone_is_active: { registerRunListener: vi.fn() },
      uvc_is_active: { registerRunListener: vi.fn() },
      bubbles_is_active: { registerRunListener: vi.fn() },
      device_is_online: { registerRunListener: vi.fn() },
    },
    actions: {
      set_temperature: { registerRunListener: vi.fn() },
      toggle_heater: { registerRunListener: vi.fn() },
      toggle_filter: { registerRunListener: vi.fn() },
      set_bubble_level: { registerRunListener: vi.fn() },
      toggle_jets: { registerRunListener: vi.fn() },
      toggle_ozone: { registerRunListener: vi.fn() },
      toggle_uvc: { registerRunListener: vi.fn() },
    },
  };

  const ClientMock = vi.fn();
  ClientMock.prototype.authenticate = vi.fn();
  ClientMock.prototype.getDevices = vi.fn().mockResolvedValue([]);
  ClientMock.prototype.sendCommand = vi.fn();
  ClientMock.prototype.getThingShadow = vi.fn();

  return {
    mockClientClass: ClientMock,
    mockFlowCards,
  };
});

const mockGetApiClient = vi.fn();

// Mock 'homey' using vi.mock
vi.mock('homey', () => {
  class Driver {
    public homey: any;
    public log: any;
    public error: any;
    public getDevices: any;

    constructor() {
      this.homey = {
        app: {
          getApiClient: mockGetApiClient,
        },
        settings: {
          get: vi.fn((key) => {
            if (key === 'email') return 'test@example.com';
            if (key === 'password') return 'test-password';
            if (key === 'region') return 'row';
            return null;
          }),
        },
        flow: {
          getConditionCard: vi.fn((id) => mockFlowCards.conditions[id]),
          getActionCard: vi.fn((id) => mockFlowCards.actions[id]),
        },
      };
      this.log = vi.fn();
      this.error = vi.fn();
      this.getDevices = vi.fn().mockReturnValue([]);
    }
  }
  return {
    Driver,
    default: { Driver },
  };
});

// Mock the mspa-api/client
vi.mock('../../../lib/mspa-api/client.js', () => ({
  MspaApiClient: mockClientClass,
}));

// Import the driver
import MspaDriver from '../../../drivers/mspa/driver.js';

// Import types
import type { DeviceInfo } from '../../../lib/mspa-api/types.js';

// Helper function to create a DeviceInfo mock
const createDeviceInfo = (overrides: Partial<DeviceInfo> = {}): DeviceInfo => ({
  device_id: '',
  product_id: '',
  product_series: '',
  product_model: '',
  software_version: '',
  wifi_version: '',
  mcu_version: '',
  device_alias: '',
  ...overrides,
});

/**
 * MockPairSession class
 */
class MockPairSession {
  private handlers: Map<string, (data: unknown) => unknown> = new Map();

  public setHandler(event: string, handler: (data: unknown) => unknown): void {
    this.handlers.set(event, handler);
  }

  public trigger(event: string, data?: unknown): unknown {
    const handler = this.handlers.get(event);
    if (!handler) {
      throw new Error(`No handler registered for event: ${event}`);
    }
    return handler(data);
  }
}

describe('MspaDriver Pairing Flow', () => {
  let driver: any;
  let session: MockPairSession;
  let mockApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new MspaDriver();
    session = new MockPairSession();
    
    mockApiClient = {
      authenticate: vi.fn().mockResolvedValue('token'),
      getDevices: vi.fn().mockResolvedValue([]),
    };
    mockGetApiClient.mockReturnValue(mockApiClient);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('List Devices Handler (list_devices)', () => {
    it('should return formatted device list using centralized client', async () => {
      await driver.onPair(session);
      
      mockApiClient.getDevices.mockResolvedValue([
        createDeviceInfo({ device_id: 'dev-001', device_alias: 'Spa 1', product_id: 'prod-a' }),
      ]);
      
      const result = await session.trigger('list_devices');
      
      expect(mockApiClient.authenticate).toHaveBeenCalled();
      expect(mockApiClient.getDevices).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect((result as any)[0].name).toBe('Spa 1');
    });

    it('should filter out duplicate devices', async () => {
      await driver.onPair(session);
      
      mockApiClient.getDevices.mockResolvedValue([
        createDeviceInfo({ device_id: 'dev-001', product_id: 'prod-a' }),
        createDeviceInfo({ device_id: 'dev-002', product_id: 'prod-b' }),
      ]);
      driver.getDevices.mockReturnValue([
        { getData: () => ({ id: 'dev-001' }) },
      ]);
      
      const result = await session.trigger('list_devices');
      
      expect(result).toHaveLength(1);
      expect((result as any)[0].data.id).toBe('dev-002');
    });

    it('should throw error if API client is not configured', async () => {
      mockGetApiClient.mockReturnValue(null);
      await driver.onPair(session);
      
      await expect(session.trigger('list_devices')).rejects.toThrow('Please configure');
    });
  });

  describe('Flow Card Registration & Execution', () => {
    it('should register all condition and action cards in onInit', async () => {
      await driver.onInit();

      expect(mockFlowCards.conditions.heater_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.temperature_equals.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.jets_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.ozone_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.uvc_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.bubbles_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.conditions.device_is_online.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.actions.set_temperature.registerRunListener).toHaveBeenCalled();
    });

    it('device_is_online follows Homey availability', async () => {
      await driver.onInit();
      const listener = mockFlowCards.conditions.device_is_online.registerRunListener.mock.calls[0][0];

      await expect(listener({ device: { getAvailable: () => true } })).resolves.toBe(true);
      await expect(listener({ device: { getAvailable: () => false } })).resolves.toBe(false);
      await expect(listener({ device: {} })).resolves.toBe(false);
    });
  });

  describe('Temperature conditions', () => {
    const runCondition = async (id: string, device: any, temperature: number) => {
      await driver.onInit();
      const listener = mockFlowCards.conditions[id].registerRunListener.mock.calls[0][0];
      return listener({ device, temperature });
    };

    const fakeDevice = (measure: number | null, target: number | null) => ({
      getCapabilityValue: (cap: string) =>
        cap === 'measure_temperature' ? measure : target,
    });

    it('temperature_above compares the measured water temperature (strictly)', async () => {
      // Target 38 but water only 24 — must be false (regression: PR used target)
      expect(await runCondition('temperature_above', fakeDevice(24, 38), 30)).toBe(false);
      expect(await runCondition('temperature_above', fakeDevice(31, 20), 30)).toBe(true);
      // Strict: exactly at the threshold is not "above"
      expect(await runCondition('temperature_above', fakeDevice(30, 30), 30)).toBe(false);
    });

    it('temperature_below compares the measured water temperature (strictly)', async () => {
      expect(await runCondition('temperature_below', fakeDevice(29, 38), 30)).toBe(true);
      // Target low but water still warm — must be false
      expect(await runCondition('temperature_below', fakeDevice(36, 20), 30)).toBe(false);
      expect(await runCondition('temperature_below', fakeDevice(30, 30), 30)).toBe(false);
    });

    it('temperature_equals compares the target temperature in 0.5°C steps', async () => {
      expect(await runCondition('temperature_equals', fakeDevice(24, 37), 37)).toBe(true);
      expect(await runCondition('temperature_equals', fakeDevice(24, 37.2), 37)).toBe(true);
      expect(await runCondition('temperature_equals', fakeDevice(24, 37.4), 37)).toBe(false);
      expect(await runCondition('temperature_equals', fakeDevice(37, 38), 37)).toBe(false);
    });

    it('returns false when capability values are missing', async () => {
      expect(await runCondition('temperature_above', fakeDevice(null, 38), 30)).toBe(false);
      expect(await runCondition('temperature_below', fakeDevice(null, 20), 30)).toBe(false);
      expect(await runCondition('temperature_equals', fakeDevice(24, null), 37)).toBe(false);
    });
  });
});
