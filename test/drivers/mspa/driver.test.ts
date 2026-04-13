import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure variables are available to vi.mock
const { mockClientClass, mockFlowCards } = vi.hoisted(() => {
  const mockFlowCards = {
    conditions: {
      heater_is_active: { registerRunListener: vi.fn() },
      filter_is_active: { registerRunListener: vi.fn() },
      temperature_above: { registerRunListener: vi.fn() },
      temperature_below: { registerRunListener: vi.fn() },
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

// Mock 'homey' using vi.mock
vi.mock('homey', () => {
  class Driver {
    public homey: any;
    public log: any;
    public error: any;
    public getDevices: any;

    constructor() {
      this.homey = {
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

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new MspaDriver();
    session = new MockPairSession();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Region Handler (select_region)', () => {
    it('should store selected region for use by subsequent handlers', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'row');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      mockClientClass.prototype.getDevices.mockResolvedValue([]);
      
      await session.trigger('login', {
        username: 'test@example.com',
        password: 'password123',
      });
      
      expect(mockClientClass).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com',
        password: 'password123',
        region: 'row',
      }));
    });
  });

  describe('Login Handler (login)', () => {
    it('should authenticate with MspaApiClient using provided credentials', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'us');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      
      await session.trigger('login', {
        username: 'user@test.com',
        password: 'mysecret',
      });
      
      expect(mockClientClass.prototype.authenticate).toHaveBeenCalled();
    });

    it('should propagate auth failure as thrown error', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'ch');
      
      mockClientClass.prototype.authenticate.mockRejectedValue(new Error('Invalid credentials'));
      
      await expect(session.trigger('login', {
        username: 'bad@example.com',
        password: 'wrongpass',
      })).rejects.toThrow('Invalid credentials');
    });

    it('should require username and password', async () => {
      await driver.onPair(session);
      
      await expect(session.trigger('login', {
        password: 'password123',
      })).rejects.toThrow('Username and password are required');
      
      await expect(session.trigger('login', {
        username: 'test@example.com',
      })).rejects.toThrow('Username and password are required');
    });
  });

  describe('List Devices Handler (list_devices)', () => {
    it('should return formatted device list from API', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'row');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      mockClientClass.prototype.getDevices.mockResolvedValue([
        createDeviceInfo({ device_id: 'dev-001', device_alias: 'Spa 1', product_id: 'prod-a' }),
        createDeviceInfo({ device_id: 'dev-002', device_alias: 'Spa 2', product_id: 'prod-b' }),
      ]);
      
      await session.trigger('login', {
        username: 'test@example.com',
        password: 'secret',
      });
      
      const result = await session.trigger('list_devices');
      
      expect(result).toHaveLength(2);
    });

    it('should filter out duplicate devices that are already paired', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'row');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      mockClientClass.prototype.getDevices.mockResolvedValue([
        createDeviceInfo({ device_id: 'dev-001', product_id: 'prod-a' }),
        createDeviceInfo({ device_id: 'dev-002', product_id: 'prod-b' }),
      ]);
      driver.getDevices.mockReturnValue([
        { getData: () => ({ id: 'dev-001' }) },
      ]);
      
      await session.trigger('login', {
        username: 'test@example.com',
        password: 'secret',
      });
      
      const result = await session.trigger('list_devices');
      
      expect(result).toHaveLength(1);
      expect((result as any)[0].data.id).toBe('dev-002');
    });

    it('should return empty array when all devices are already paired', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'row');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      mockClientClass.prototype.getDevices.mockResolvedValue([
        createDeviceInfo({ device_id: 'dev-001', product_id: 'prod-a' }),
        createDeviceInfo({ device_id: 'dev-002', product_id: 'prod-b' }),
      ]);
      driver.getDevices.mockReturnValue([
        { getData: () => ({ id: 'dev-001' }) },
        { getData: () => ({ id: 'dev-002' }) },
      ]);
      
      await session.trigger('login', {
        username: 'test@example.com',
        password: 'secret',
      });
      
      const result = await session.trigger('list_devices');
      
      expect(result).toEqual([]);
    });

    it('should return empty array when API returns no devices', async () => {
      await driver.onPair(session);
      await session.trigger('select_region', 'row');
      
      mockClientClass.prototype.authenticate.mockResolvedValue('token');
      mockClientClass.prototype.getDevices.mockResolvedValue([]);
      
      await session.trigger('login', {
        username: 'test@example.com',
        password: 'secret',
      });
      
      const result = await session.trigger('list_devices');
      
      expect(result).toEqual([]);
    });

    it('should require authentication before listing devices', async () => {
      await driver.onPair(session);
      
      await expect(session.trigger('list_devices')).rejects.toThrow('Authentication required before listing devices');
    });
  });

  describe('Flow Card Registration & Execution', () => {
    it('should register all condition and action cards in onInit', async () => {
      await driver.onInit();

      expect(mockFlowCards.conditions.heater_is_active.registerRunListener).toHaveBeenCalled();
      expect(mockFlowCards.actions.set_temperature.registerRunListener).toHaveBeenCalled();
    });

    it('heater_is_active condition should return true when heater_active is true', async () => {
      await driver.onInit();
      const listener = mockFlowCards.conditions.heater_is_active.registerRunListener.mock.calls[0][0];
      
      const mockDevice = { getCapabilityValue: vi.fn().mockReturnValue(true) };
      const result = await listener({ device: mockDevice });
      
      expect(result).toBe(true);
      expect(mockDevice.getCapabilityValue).toHaveBeenCalledWith('heater_active');
    });

    it('temperature_above condition should return true when temp >= threshold', async () => {
      await driver.onInit();
      const listener = mockFlowCards.conditions.temperature_above.registerRunListener.mock.calls[0][0];
      
      const mockDevice = { getCapabilityValue: vi.fn().mockReturnValue(38) };
      
      expect(await listener({ device: mockDevice, temperature: 37 })).toBe(true);
      expect(await listener({ device: mockDevice, temperature: 38 })).toBe(true);
      expect(await listener({ device: mockDevice, temperature: 39 })).toBe(false);
    });

    it('set_temperature action should delegate to device.triggerCapabilityListener', async () => {
      await driver.onInit();
      const listener = mockFlowCards.actions.set_temperature.registerRunListener.mock.calls[0][0];
      
      const mockDevice = { triggerCapabilityListener: vi.fn().mockResolvedValue(true) };
      await listener({ device: mockDevice, temperature: 38 });
      
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('target_temperature', 38);
    });

    it('toggle_heater action should delegate with correct boolean', async () => {
      await driver.onInit();
      const listener = mockFlowCards.actions.toggle_heater.registerRunListener.mock.calls[0][0];
      
      const mockDevice = { triggerCapabilityListener: vi.fn().mockResolvedValue(true) };
      
      await listener({ device: mockDevice, state: 'on' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.heater', true);
      
      await listener({ device: mockDevice, state: 'off' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.heater', false);
    });

    it('should register and execute all other action cards', async () => {
      await driver.onInit();
      const mockDevice = { triggerCapabilityListener: vi.fn().mockResolvedValue(true) };

      // toggle_filter
      await mockFlowCards.actions.toggle_filter.registerRunListener.mock.calls[0][0]({ device: mockDevice, state: 'on' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.filter', true);

      // set_bubble_level
      await mockFlowCards.actions.set_bubble_level.registerRunListener.mock.calls[0][0]({ device: mockDevice, level: '2' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('bubble_level', '2');

      // toggle_jets
      await mockFlowCards.actions.toggle_jets.registerRunListener.mock.calls[0][0]({ device: mockDevice, state: 'off' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.jets', false);

      // toggle_ozone
      await mockFlowCards.actions.toggle_ozone.registerRunListener.mock.calls[0][0]({ device: mockDevice, state: 'on' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.ozone', true);

      // toggle_uvc
      await mockFlowCards.actions.toggle_uvc.registerRunListener.mock.calls[0][0]({ device: mockDevice, state: 'on' });
      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith('onoff.uvc', true);
    });

    it('should register and execute all other condition cards', async () => {
      await driver.onInit();
      
      // filter_is_active
      const filterActiveListener = mockFlowCards.conditions.filter_is_active.registerRunListener.mock.calls[0][0];
      expect(await filterActiveListener({ device: { getCapabilityValue: () => true } })).toBe(true);
      expect(await filterActiveListener({ device: { getCapabilityValue: () => false } })).toBe(false);

      // temperature_below
      const tempBelowListener = mockFlowCards.conditions.temperature_below.registerRunListener.mock.calls[0][0];
      expect(await tempBelowListener({ device: { getCapabilityValue: () => 38 }, temperature: 39 })).toBe(true);
      expect(await tempBelowListener({ device: { getCapabilityValue: () => 38 }, temperature: 37 })).toBe(false);
    });
  });
});
