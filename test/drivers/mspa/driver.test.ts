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

  describe('Boolean condition cards', () => {
    // These twelve cards were previously only asserted to be *registered*. Flow
    // card meaning is a public contract — users have saved Flows against it, and
    // it has silently changed once before (temperature_above/below) — so the run
    // listeners are exercised here, not just their registration.
    const run = async (id: string, device: any, extra: Record<string, unknown> = {}) => {
      await driver.onInit();
      const listener = mockFlowCards.conditions[id].registerRunListener.mock.calls[0][0];
      return listener({ device, ...extra });
    };

    /** A device with capabilities only — no isBooleanFeatureOn helper. */
    const plain = (caps: Record<string, unknown>) => ({
      hasCapability: (c: string) => c in caps,
      getCapabilityValue: (c: string) => caps[c],
    });

    describe('heater_is_active', () => {
      it('is true while the heater is switched on, even when not actively heating', async () => {
        // Deliberate: heater_active narrowed in v1.0.6 to mean "really heating",
        // but the card keeps its original "heater is on" meaning via the OR.
        expect(await run('heater_is_active', plain({ heater_active: false, mspa_heater: true }))).toBe(true);
      });

      it('is true when actively heating', async () => {
        expect(await run('heater_is_active', plain({ heater_active: true, mspa_heater: false }))).toBe(true);
      });

      it('is false when both are off', async () => {
        expect(await run('heater_is_active', plain({ heater_active: false, mspa_heater: false }))).toBe(false);
      });

      it('returns a real boolean for missing values so Homey can invert it', async () => {
        const res = await run('heater_is_active', plain({}));
        expect(res).toBe(false);
        expect(typeof res).toBe('boolean');
      });

      it('accepts the API string and number spellings of on', async () => {
        expect(await run('heater_is_active', plain({ mspa_heater: 1 }))).toBe(true);
        expect(await run('heater_is_active', plain({ mspa_heater: '1' }))).toBe(true);
        expect(await run('heater_is_active', plain({ mspa_heater: 'on' }))).toBe(true);
        expect(await run('heater_is_active', plain({ mspa_heater: 'true' }))).toBe(true);
        expect(await run('heater_is_active', plain({ mspa_heater: 0 }))).toBe(false);
      });
    });

    describe('filter_is_active', () => {
      it('ORs filter_active with mspa_filter', async () => {
        expect(await run('filter_is_active', plain({ filter_active: false, mspa_filter: true }))).toBe(true);
        expect(await run('filter_is_active', plain({ filter_active: true, mspa_filter: false }))).toBe(true);
        expect(await run('filter_is_active', plain({ filter_active: false, mspa_filter: false }))).toBe(false);
      });
    });

    describe('optional feature cards prefer the device helper', () => {
      const withHelper = (value: boolean) => ({
        hasCapability: () => true,
        getCapabilityValue: () => null,
        isBooleanFeatureOn: vi.fn().mockReturnValue(value),
      });

      it('jets_is_active reads mspa_jets, falling back to jet_state', async () => {
        const device = withHelper(true);
        expect(await run('jets_is_active', device)).toBe(true);
        expect(device.isBooleanFeatureOn).toHaveBeenCalledWith('mspa_jets', 'jet_state');
      });

      it('ozone_is_active reads mspa_ozone, falling back to ozone_state', async () => {
        const device = withHelper(false);
        expect(await run('ozone_is_active', device)).toBe(false);
        expect(device.isBooleanFeatureOn).toHaveBeenCalledWith('mspa_ozone', 'ozone_state');
      });

      it('uvc_is_active reads mspa_uvc, falling back to uvc_state', async () => {
        const device = withHelper(true);
        expect(await run('uvc_is_active', device)).toBe(true);
        expect(device.isBooleanFeatureOn).toHaveBeenCalledWith('mspa_uvc', 'uvc_state');
      });
    });

    describe('optional feature cards without the helper', () => {
      it('are false when the capability is absent rather than throwing', async () => {
        expect(await run('jets_is_active', plain({}))).toBe(false);
        expect(await run('uvc_is_active', plain({}))).toBe(false);
      });

      it('read the capability when it is present', async () => {
        expect(await run('jets_is_active', plain({ mspa_jets: true }))).toBe(true);
        expect(await run('uvc_is_active', plain({ mspa_uvc: '1' }))).toBe(true);
      });
    });

    describe('ozone_is_active restores a wrongly stripped capability', () => {
      it('asks the device to re-add mspa_ozone before reading it', async () => {
        const ensureOptionalCapability = vi.fn().mockResolvedValue(true);
        const device = {
          hasCapability: vi.fn().mockReturnValue(false),
          getCapabilityValue: () => null,
          ensureOptionalCapability,
        };
        expect(await run('ozone_is_active', device)).toBe(false);
        expect(ensureOptionalCapability).toHaveBeenCalledWith('mspa_ozone');
      });
    });

    describe('bubbles_is_active', () => {
      it('is false for every spelling of off', async () => {
        for (const level of ['off', 0, '0', null, undefined]) {
          expect(await run('bubbles_is_active', plain({ bubble_level: level }))).toBe(false);
        }
      });

      it('is true for any running speed', async () => {
        for (const level of ['1', '2', '3']) {
          expect(await run('bubbles_is_active', plain({ bubble_level: level }))).toBe(true);
        }
      });

      it('is false when the model has no bubbles', async () => {
        expect(await run('bubbles_is_active', {
          hasCapability: () => false,
          getCapabilityValue: () => '3',
        })).toBe(false);
      });
    });
  });

  describe('Action cards', () => {
    const runAction = async (id: string, device: any, extra: Record<string, unknown> = {}) => {
      await driver.onInit();
      const listener = mockFlowCards.actions[id].registerRunListener.mock.calls[0][0];
      return listener({ device, ...extra });
    };

    const actionDevice = (caps: string[] = []) => ({
      hasCapability: (c: string) => caps.includes(c),
      triggerCapabilityListener: vi.fn().mockResolvedValue(undefined),
    });

    it('set_temperature passes the requested target through', async () => {
      const device = actionDevice(['target_temperature']);
      await runAction('set_temperature', device, { temperature: 38.5 });
      expect(device.triggerCapabilityListener).toHaveBeenCalledWith('target_temperature', 38.5);
    });

    it('toggle_heater maps the on/off argument to a boolean', async () => {
      const device = actionDevice(['mspa_heater']);
      await runAction('toggle_heater', device, { state: 'on' });
      expect(device.triggerCapabilityListener).toHaveBeenCalledWith('mspa_heater', true);

      const off = actionDevice(['mspa_heater']);
      await runAction('toggle_heater', off, { state: 'off' });
      expect(off.triggerCapabilityListener).toHaveBeenCalledWith('mspa_heater', false);
    });

    it('toggle_filter maps the on/off argument to a boolean', async () => {
      const device = actionDevice(['mspa_filter']);
      await runAction('toggle_filter', device, { state: 'off' });
      expect(device.triggerCapabilityListener).toHaveBeenCalledWith('mspa_filter', false);
    });

    it('set_bubble_level passes the level enum through unchanged', async () => {
      const device = actionDevice(['bubble_level']);
      await runAction('set_bubble_level', device, { level: '2' });
      expect(device.triggerCapabilityListener).toHaveBeenCalledWith('bubble_level', '2');
    });

    describe('optional feature actions', () => {
      it('toggle_jets sets the capability when present', async () => {
        const device = actionDevice(['mspa_jets']);
        await runAction('toggle_jets', device, { state: 'on' });
        expect(device.triggerCapabilityListener).toHaveBeenCalledWith('mspa_jets', true);
      });

      it('toggle_ozone re-adds a stripped capability before setting it', async () => {
        const caps: string[] = [];
        const device = {
          hasCapability: (c: string) => caps.includes(c),
          ensureOptionalCapability: vi.fn(async (c: string) => { caps.push(c); return true; }),
          triggerCapabilityListener: vi.fn().mockResolvedValue(undefined),
        };
        await runAction('toggle_ozone', device, { state: 'on' });
        expect(device.ensureOptionalCapability).toHaveBeenCalledWith('mspa_ozone');
        expect(device.triggerCapabilityListener).toHaveBeenCalledWith('mspa_ozone', true);
      });

      it('toggle_uvc fails with a readable message when the model lacks the feature', async () => {
        const device = {
          hasCapability: () => false,
          triggerCapabilityListener: vi.fn(),
        };
        await expect(runAction('toggle_uvc', device, { state: 'on' }))
          .rejects.toThrow(/no UVC control/);
        expect(device.triggerCapabilityListener).not.toHaveBeenCalled();
      });

      it('toggle_jets fails when the capability cannot be restored', async () => {
        const device = {
          hasCapability: () => false,
          ensureOptionalCapability: vi.fn().mockResolvedValue(false),
          triggerCapabilityListener: vi.fn(),
        };
        await expect(runAction('toggle_jets', device, { state: 'on' }))
          .rejects.toThrow(/no jets control/);
      });
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
