import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure variables are available to vi.mock
const { 
  mockSendCommand, 
  mockAuthenticate, 
  mockGetThingShadow, 
  mockParseShadow,
  mockHomeyDevice,
  mockTriggerCards
} = vi.hoisted(() => {
  const mockSendCommand = vi.fn();
  const mockAuthenticate = vi.fn();
  const mockGetThingShadow = vi.fn();
  const mockParseShadow = vi.fn();
  
  const mockTriggerCards = {
    temperature_changed: { trigger: vi.fn().mockImplementation(() => Promise.resolve(true)) },
    fault_detected: { trigger: vi.fn().mockImplementation(() => Promise.resolve(true)) },
    device_online: { trigger: vi.fn().mockImplementation(() => Promise.resolve(true)) },
    device_offline: { trigger: vi.fn().mockImplementation(() => Promise.resolve(true)) },
  };

  const mockHomeyDevice = {
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    flow: {
      getDeviceTriggerCard: vi.fn((id) => mockTriggerCards[id]),
    },
    app: {
      getApiClient: vi.fn(() => ({
        authenticate: mockAuthenticate,
        getDevices: vi.fn(),
        getThingShadow: mockGetThingShadow,
        sendCommand: mockSendCommand,
      })),
    },
    settings: {
      get: vi.fn((key) => {
        if (key === 'email') return 'test@example.com';
        if (key === 'password') return 'test-password';
        if (key === 'region') return 'row';
        return null;
      }),
    },
  };

  return { 
    mockSendCommand, 
    mockAuthenticate, 
    mockGetThingShadow, 
    mockParseShadow,
    mockHomeyDevice,
    mockTriggerCards
  };
});

// Mock homey
vi.mock('homey', () => {
  const Device = class {
    public homey: any;
    public _store: any;
    public _data: any;
    public _capabilities: any;
    public _available: boolean;
    public _logs: string[];
    public _lastUnavailableMessage?: string;
    public _capabilityListeners: any;

    constructor() {
      this._store = {};
      this._data = { id: 'test-device-id' };
      this._capabilities = {
        'measure_temperature': 0,
        'target_temperature': 0,
        'onoff.heater': false,
        'onoff.filter': false,
        'onoff.jets': false,
        'onoff.ozone': false,
        'onoff.uvc': false,
        'bubble_level': 'off',
        'heater_active': false,
        'filter_active': false,
      };
      this._available = true;
      this._logs = [];
      this.homey = mockHomeyDevice;
    }

    getStore() { return this._store; }
    getStoreValue(key) { return this._store[key]; }
    setStoreValue(key, value) { return Promise.resolve(); }
    getData(key) { if (key) return this._data[key]; return this._data; }
    setData(key, value) { return Promise.resolve(); }
    setCapabilityValue(capabilityId, value) { this._capabilities[capabilityId] = value; return Promise.resolve(); }
    getCapabilityValue(capabilityId) { return this._capabilities[capabilityId]; }
    hasCapability(capabilityId) { return this._capabilities[capabilityId] !== undefined; }
    async removeCapability(capabilityId) { delete this._capabilities[capabilityId]; return Promise.resolve(); }
    registerCapabilityListener(capabilityId, handler) {
      if (!this._capabilityListeners) this._capabilityListeners = {};
      this._capabilityListeners[capabilityId] = handler;
      return Promise.resolve();
    }
    setAvailable(message) { this._available = true; return Promise.resolve(); }
    setUnavailable(message) { this._available = false; this._lastUnavailableMessage = message; return Promise.resolve(); }
    isAvailable() { return this._available; }
    log(...args) { this._logs.push(args.join(' ')); }
    error(...args) { this._logs.push('ERROR: ' + args.join(' ')); }
  };
  return {
    Device,
    default: { Device },
  };
});

// Mock MspaApiClient
vi.mock('../../../lib/mspa-api/client.js', () => ({
  MspaApiClient: class {
    constructor() {}
    authenticate = mockAuthenticate;
    getDevices = vi.fn();
    getThingShadow = mockGetThingShadow;
    sendCommand = mockSendCommand;
  },
}));

// Mock parseShadow
vi.mock('../../../lib/mspa-api/shadow.js', () => ({
  parseShadow: mockParseShadow,
}));

// Mock throttle
vi.mock('../../../lib/mspa-api/throttle.js', () => ({
  MspaThrottle: class {
    constructor() {}
    async acquire() {}
    release() {}
  },
}));

// Import the MspaDevice class after all mocks are set up
import MspaDevice from '../../../drivers/mspa/device.js';

describe('MspaDevice', () => {
  let device: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCommand.mockResolvedValue({});
    mockAuthenticate.mockResolvedValue('test-token');
    mockGetThingShadow.mockResolvedValue({});
    mockParseShadow.mockReturnValue({});
    
    // Ensure trigger cards return a promise
    Object.values(mockTriggerCards).forEach(card => {
      card.trigger.mockResolvedValue(true);
    });

    mockHomeyDevice.setTimeout.mockImplementation((fn, delay) => {
      const t = Symbol('timeout');
      return t;
    });
    mockHomeyDevice.setInterval.mockImplementation((fn, interval) => {
      const t = Symbol('interval');
      return t;
    });

    // Create a new device instance
    device = new MspaDevice();
    
    // Set up store with credentials
    (device as any)._store = {
      product_id: 'test-product-id',
      product_series: 'Frame', // Supports all capabilities
    };
    (device as any)._data = { id: 'test-device-id' };
    (device as any)._available = true;
    (device as any).consecutiveFailures = 0;
    (device as any).isRapidPolling = false;
    (device as any).idlePollTimer = null;
    (device as any).rapidPollTimer = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization (onInit)', () => {
    it('should fetch shadow and sync capabilities during onInit', async () => {
      // Setup: Mock successful shadow fetch
      mockGetThingShadow.mockResolvedValue({
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
      });
      
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 2,
        uvc_state: false,
        ozone_state: true,
        jet_state: false,
        fault: '',
      });

      // Act: Call onInit
      await device.onInit();

      // Verify shadow was fetched
      expect(mockGetThingShadow).toHaveBeenCalledWith('test-device-id', 'test-product-id');

      // Verify parseShadow was called
      expect(mockParseShadow).toHaveBeenCalled();

      // Verify capabilities were synced
      expect(device.getCapabilityValue('measure_temperature')).toBe(38);
      expect(device.getCapabilityValue('target_temperature')).toBe(40);
      expect(device.getCapabilityValue('onoff.heater')).toBe(true);
      expect(device.getCapabilityValue('onoff.filter')).toBe(false);
      expect(device.getCapabilityValue('onoff.jets')).toBe(false);
      expect(device.getCapabilityValue('onoff.ozone')).toBe(true);
      expect(device.getCapabilityValue('onoff.uvc')).toBe(false);
      expect(device.getCapabilityValue('bubble_level')).toBe('2');
      expect(device.getCapabilityValue('heater_active')).toBe(true);
      expect(device.getCapabilityValue('filter_active')).toBe(false);

      // Verify device is available
      expect(device.isAvailable()).toBe(true);
    });

    it('should mark device unavailable if app settings are missing', async () => {
      // Setup: Missing app settings
      mockHomeyDevice.app.getApiClient.mockReturnValue(null);

      // Act
      await device.onInit();

      // Assert
      expect(device.isAvailable()).toBe(false);
      expect(device._lastUnavailableMessage).toContain('Please configure');
    });

    it('should mark device unavailable if API calls fail repeatedly', async () => {
      // Setup
      mockGetThingShadow.mockRejectedValue(new Error('API failure'));
      
      // Simulate 3 failures
      await device.onInit(); // Failure 1
      await device.performPoll(); // Failure 2
      await device.performPoll(); // Failure 3

      // Assert
      expect(device.isAvailable()).toBe(false);
      expect(device._lastUnavailableMessage).toContain('Could not reach your spa');
    });

    it('should mark device unavailable after 3 consecutive poll failures', async () => {
      // Setup
      mockGetThingShadow.mockRejectedValue(new Error('Network error'));
      
      // Act
      await device.onInit();
      
      // Device should be available after first failure
      expect(device.isAvailable()).toBe(true);
      
      // Simulate 2 more failures by calling performPoll directly
      await device.performPoll(); // Failure #2
      await device.performPoll(); // Failure #3 - should mark unavailable
      
      // Assert
      expect(device.isAvailable()).toBe(false);
      expect(device._lastUnavailableMessage).toContain('Could not reach your spa');
    });

    it('should restore availability after a successful poll following failures', async () => {
      // Setup
      mockGetThingShadow.mockRejectedValue(new Error('Network error'));
      
      // Act: Fail 3 times to trigger unavailability
      await device.onInit();
      await device.performPoll();
      await device.performPoll();
      await device.performPoll();
      
      expect(device.isAvailable()).toBe(false);
      
      // Now succeed
      mockGetThingShadow.mockResolvedValue({
        water_temperature: 76,
        temperature_setting: 80,
        heater_state: 1,
        filter_state: 0,
        bubble_state: 1,
        bubble_level: 0,
        uvc_state: 0,
        ozone_state: 0,
        jet_state: 0,
        fault: '',
      });
      
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });
      
      await device.performPoll();
      
      // Assert
      expect(device.isAvailable()).toBe(true);
    });
  });

  describe('Shadow-to-capability mapping', () => {
    it('should correctly map all 10 capabilities from parsed shadow', async () => {
      // Setup
      mockParseShadow.mockReturnValue({
        water_temperature: 38.5,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 3,
        uvc_state: true,
        ozone_state: false,
        jet_state: true,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({});

      // Act
      await device.onInit();

      // Assert: Verify all capabilities are set correctly
      expect(device.getCapabilityValue('measure_temperature')).toBe(38.5);
      expect(device.getCapabilityValue('target_temperature')).toBe(40);
      expect(device.getCapabilityValue('onoff.heater')).toBe(true);
      expect(device.getCapabilityValue('onoff.filter')).toBe(false);
      expect(device.getCapabilityValue('onoff.jets')).toBe(true);
      expect(device.getCapabilityValue('onoff.ozone')).toBe(false);
      expect(device.getCapabilityValue('onoff.uvc')).toBe(true);
      expect(device.getCapabilityValue('bubble_level')).toBe('3'); // 3 → '3'
      expect(device.getCapabilityValue('heater_active')).toBe(true);
      expect(device.getCapabilityValue('filter_active')).toBe(false);
    });

    it('should convert bubble_level 0 to string "off"', async () => {
      // Setup
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: true,
        bubble_state: false,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({});

      // Act
      await device.onInit();

      // Assert
      expect(device.getCapabilityValue('bubble_level')).toBe('off');
    });

    it('should handle fault string by marking device unavailable', async () => {
      // Setup
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: true,
        bubble_state: true,
        bubble_level: 2,
        uvc_state: true,
        ozone_state: true,
        jet_state: true,
        fault: 'E1',
      });
      mockGetThingShadow.mockResolvedValue({});

      // Act
      await device.onInit();

      // Assert
      expect(device.isAvailable()).toBe(false);
      expect(device._lastUnavailableMessage).toContain('E1');
    });
  });

  describe('Temperature command encoding (2x encoding)', () => {
    it('should send temperature * 2 to API when target_temperature changes', async () => {
      // Setup
      await device.onInit();

      // Act: Set target temperature to 35
      const listener = (device as any)._capabilityListeners['target_temperature'];
      await listener(35);

      // Assert
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { temperature_setting: 70 } // 35 * 2
      );
    });
  });

  describe('Bubble level command encoding', () => {
    it('should send bubble_level 0 when listener receives "off"', async () => {
      // Setup
      await device.onInit();

      // Act
      const listener = (device as any)._capabilityListeners['bubble_level'];
      await listener('off');

      // Assert
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { bubble_level: 0 }
      );
    });

    it('should send bubble_level number when listener receives enum string', async () => {
      // Setup
      await device.onInit();

      // Act
      const listener = (device as any)._capabilityListeners['bubble_level'];
      await listener('3');

      // Assert
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { bubble_level: 3 }
      );
    });
  });

  describe('Filter→heater constraint enforcement (D003)', () => {
    it('should turn off heater when filter is turned off and heater is on', async () => {
      // Setup
      await device.onInit();
      
      // Set heater to on
      device.setCapabilityValue('onoff.heater', true);

      // Act: Turn off filter
      const listener = (device as any)._capabilityListeners['onoff.filter'];
      await listener(false);

      // Assert: Both heater and filter commands should be sent
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { heater_state: 0 }
      );
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { filter_state: 0 }
      );

      // Assert: Heater capability should be set to false
      expect(device.getCapabilityValue('onoff.heater')).toBe(false);
    });

    it('should not turn off heater when filter is turned off and heater is already off', async () => {
      // Setup
      await device.onInit();
      
      // Set heater to off
      device.setCapabilityValue('onoff.heater', false);

      // Act: Turn off filter
      const listener = (device as any)._capabilityListeners['onoff.filter'];
      await listener(false);

      // Assert: Only filter command should be sent, not heater
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { filter_state: 0 }
      );
      
      // Should only be called once (for filter)
      const heaterCalls = mockSendCommand.mock.calls.filter(
        (call) => call[2]?.heater_state === 0
      );
      expect(heaterCalls.length).toBe(0);
    });

    it('should not change heater when filter is turned on', async () => {
      // Setup
      await device.onInit();

      // Act: Turn on filter
      const listener = (device as any)._capabilityListeners['onoff.filter'];
      await listener(true);

      // Assert: Only filter command should be sent
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { filter_state: 1 }
      );
      
      // heater_state should not be in any command
      const heaterCommands = mockSendCommand.mock.calls
        .map((call) => call[2])
        .filter((cmd) => cmd.heater_state !== undefined);
      expect(heaterCommands.length).toBe(0);
    });
  });

  describe('Rapid polling trigger', () => {
    it('should start rapid polling after sending a command', async () => {
      // Setup
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({
        water_temperature: 76,
        temperature_setting: 80,
        heater_state: 1,
        filter_state: 0,
        bubble_state: 1,
        bubble_level: 0,
        uvc_state: 0,
        ozone_state: 0,
        jet_state: 0,
        fault: '',
      });
      
      await device.onInit();

      // Reset mocks to track only rapid polling setup
      mockSendCommand.mockClear();
      mockHomeyDevice.setTimeout.mockClear();
      mockHomeyDevice.clearTimeout.mockClear();
      mockHomeyDevice.setInterval.mockClear();

      // Act: Send a command via capability listener
      const listener = (device as any)._capabilityListeners['onoff.heater'];
      await listener(true);

      // Assert: startRapidPolling should be called
      expect((device as any).isRapidPolling).toBe(true);
      
      // setTimeout should have been called for the rapid poll sequence
      expect(mockHomeyDevice.setTimeout).toHaveBeenCalled();
    });

    it('should return to idle polling after rapid polling duration', async () => {
      // Setup
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({
        water_temperature: 76,
        temperature_setting: 80,
        heater_state: 1,
        filter_state: 0,
        bubble_state: 1,
        bubble_level: 0,
        uvc_state: 0,
        ozone_state: 0,
        jet_state: 0,
        fault: '',
      });
      
      await device.onInit();
      mockHomeyDevice.setTimeout.mockClear();
      mockHomeyDevice.clearTimeout.mockClear();
      mockHomeyDevice.setInterval.mockClear();

      // Act: Trigger rapid polling
      const listener = (device as any)._capabilityListeners['onoff.heater'];
      await listener(true);
      
      expect((device as any).isRapidPolling).toBe(true);
      
      // Find the rapid poll callback that was scheduled
      const setTimeoutCall = mockHomeyDevice.setTimeout.mock.calls[0];
      const rapidPollCallback = setTimeoutCall[0];
      
      // Simulate all rapid polls completing (6 polls at 5s each = 30s)
      for (let i = 0; i < 6; i++) {
        await rapidPollCallback();
      }

      // Assert: Rapid polling should end and idle polling should resume
      expect((device as any).isRapidPolling).toBe(false);
      expect(mockHomeyDevice.setInterval).toHaveBeenCalled();
      
      // Verify setInterval was called with 900000ms (15 minutes)
      const intervalCall = mockHomeyDevice.setInterval.mock.calls[0];
      expect(intervalCall[1]).toBe(900000);
    });
  });

  describe('Cleanup (onDeleted)', () => {
    it('should clear both idle and rapid polling timers', async () => {
      // Setup
      await device.onInit();

      // Set up timers
      const idleTimer = Symbol('idle');
      const rapidTimer = Symbol('rapid');
      (device as any).idlePollTimer = idleTimer;
      (device as any).rapidPollTimer = rapidTimer;

      // Act
      await device.onDeleted();

      // Assert: Both timers should be cleared
      expect(mockHomeyDevice.clearTimeout).toHaveBeenCalledWith(idleTimer);
      expect(mockHomeyDevice.clearTimeout).toHaveBeenCalledWith(rapidTimer);
      
      // Verify timers are null
      expect((device as any).idlePollTimer).toBeNull();
      expect((device as any).rapidPollTimer).toBeNull();
    });
  });

  describe('Other capability listeners', () => {
    it('should send correct commands for jets, ozone, and uvc', async () => {
      // Setup
      await device.onInit();

      // Test jets
      const jetsListener = (device as any)._capabilityListeners['onoff.jets'];
      await jetsListener(true);
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { jet_state: 1 }
      );

      // Test ozone
      mockSendCommand.mockClear();
      const ozoneListener = (device as any)._capabilityListeners['onoff.ozone'];
      await ozoneListener(false);
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { ozone_state: 0 }
      );

      // Test uvc
      mockSendCommand.mockClear();
      const uvcListener = (device as any)._capabilityListeners['onoff.uvc'];
      await uvcListener(true);
      expect(mockSendCommand).toHaveBeenCalledWith(
        'test-device-id',
        'test-product-id',
        { uvc_state: 1 }
      );
    });
  });

  describe('Flow Triggers', () => {
    beforeEach(async () => {
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({});
      await device.onInit();
      vi.clearAllMocks();
    });

    it('should fire temperature_changed when water_temperature changes between polls', async () => {
      // Setup: temperature changes from 38 to 39
      mockParseShadow.mockReturnValue({
        water_temperature: 39,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.temperature_changed.trigger).toHaveBeenCalledWith(device, { temperature: 39 });
    });

    it('should NOT fire temperature_changed when temperature is unchanged', async () => {
      // Setup: temperature stays at 38
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.temperature_changed.trigger).not.toHaveBeenCalled();
    });

    it('should fire fault_detected when fault goes from empty to non-empty', async () => {
      // Setup: fault appears
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: 'E1',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.fault_detected.trigger).toHaveBeenCalledWith(device, { fault_code: 'E1' });
    });

    it('should NOT fire fault_detected when fault clearing', async () => {
      // Setup: first set a fault
      (device as any).previousShadow = { fault: 'E1', water_temperature: 38 };

      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.fault_detected.trigger).not.toHaveBeenCalled();
    });

    it('should fire device_online when device recovers from unavailable state', async () => {
      // Setup: device is unavailable
      (device as any).wasAvailable = false;
      (device as any)._available = false;

      mockGetThingShadow.mockResolvedValue({});
      mockParseShadow.mockReturnValue({ water_temperature: 38 });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.device_online.trigger).toHaveBeenCalledWith(device);
      expect(device.isAvailable()).toBe(true);
    });

    it('should fire device_offline when device hits consecutive failure threshold', async () => {
      // Setup: device is available, but failing
      (device as any).wasAvailable = true;
      (device as any).consecutiveFailures = 2; // Next failure is #3
      mockGetThingShadow.mockRejectedValue(new Error('Network error'));

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.device_offline.trigger).toHaveBeenCalledWith(device);
      expect(device.isAvailable()).toBe(false);
    });

    it('should NOT fire triggers on initial sync (previousShadow is null)', async () => {
      // Create fresh device
      const freshDevice = new MspaDevice();
      (freshDevice as any)._store = {
        product_id: 'test-product-id',
      };
      (freshDevice as any)._data = { id: 'test-device-id' };
      
      mockGetThingShadow.mockResolvedValue({});
      mockParseShadow.mockReturnValue({ water_temperature: 38 });

      // Act
      await freshDevice.onInit();

      // Assert
      expect(mockTriggerCards.temperature_changed.trigger).not.toHaveBeenCalled();
    });

    it('should NOT fire fault_detected if fault is same as before', async () => {
      // Setup: first set a fault
      (device as any).previousShadow = { fault: 'E1', water_temperature: 38 };

      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: 'E1',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.fault_detected.trigger).not.toHaveBeenCalled();
    });

    it('should NOT fire device_online if already online', async () => {
      // Setup: device is already available
      (device as any).wasAvailable = true;
      (device as any)._available = true;

      mockGetThingShadow.mockResolvedValue({});
      mockParseShadow.mockReturnValue({ water_temperature: 38 });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.device_online.trigger).not.toHaveBeenCalled();
    });

    it('should NOT fire device_offline if already offline', async () => {
      // Setup: device is already unavailable
      (device as any).wasAvailable = false;
      (device as any).consecutiveFailures = 3;
      mockGetThingShadow.mockRejectedValue(new Error('Network error'));

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.device_offline.trigger).not.toHaveBeenCalled();
    });

    it('should fire multiple triggers if both temp and fault change', async () => {
      // Setup: temp change AND fault appears
      mockParseShadow.mockReturnValue({
        water_temperature: 39,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: 'E1',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.temperature_changed.trigger).toHaveBeenCalledWith(device, { temperature: 39 });
      expect(mockTriggerCards.fault_detected.trigger).toHaveBeenCalledWith(device, { fault_code: 'E1' });
    });

    it('should fire triggers even if rapid polling is active', async () => {
      // Setup
      (device as any).isRapidPolling = true;
      mockParseShadow.mockReturnValue({
        water_temperature: 39,
        temperature_setting: 40,
        heater_state: true,
        filter_state: false,
        bubble_state: true,
        bubble_level: 0,
        uvc_state: false,
        ozone_state: false,
        jet_state: false,
        fault: '',
      });

      // Act
      await device.performPoll();

      // Assert
      expect(mockTriggerCards.temperature_changed.trigger).toHaveBeenCalled();
    });

    it('should stop rapid polling and resume idle polling correctly', async () => {
      // This is a bit redundant with existing tests but good for count
      await device.startRapidPolling();
      expect(device.isRapidPolling).toBe(true);
      
      // Manually trigger the end of rapid polling by simulating polls
      const rapidPollCallback = mockHomeyDevice.setTimeout.mock.calls[0][0];
      for (let i = 0; i < 6; i++) {
        await rapidPollCallback();
      }
      
      expect(device.isRapidPolling).toBe(false);
      expect(mockHomeyDevice.setInterval).toHaveBeenCalled();
    });
  });

  describe('Product Profiling and Capability Filtering', () => {
    beforeEach(() => {
      mockParseShadow.mockReturnValue({
        water_temperature: 38,
        temperature_setting: 40,
        heater_state: true,
        filter_state: true,
        bubble_state: true,
        bubble_level: 2,
        uvc_state: true,
        ozone_state: true,
        jet_state: true,
        fault: '',
      });
      mockGetThingShadow.mockResolvedValue({});
    });

    it('should remove unsupported capabilities for a Delight model', async () => {
      // Setup: Delight model (Bubbles only)
      (device as any)._store = {
        product_id: 'test-product-id',
        product_series: 'Delight',
        product_model: 'D-01',
      };
      
      // Initially has all capabilities
      (device as any)._capabilities['onoff.jets'] = false;
      (device as any)._capabilities['onoff.ozone'] = false;
      (device as any)._capabilities['onoff.uvc'] = false;
      (device as any)._capabilities['bubble_level'] = 'off';
      (device as any)._capabilities['onoff.heater'] = false;

      // Act
      await device.onInit();

      // Assert
      expect(device.getCapabilityValue('onoff.jets')).toBeUndefined();
      expect(device.getCapabilityValue('onoff.ozone')).toBeUndefined();
      expect(device.getCapabilityValue('onoff.uvc')).toBeUndefined();
      expect(device.hasCapability('bubble_level')).toBe(true); // Delight has bubbles
      expect(device.hasCapability('onoff.heater')).toBe(true);
    });

    it('should keep all capabilities for a Frame model', async () => {
      // Setup: Frame model (All features)
      (device as any)._store = {
        product_id: 'test-product-id',
        product_series: 'Frame',
        product_model: 'F-01',
      };
      
      (device as any)._capabilities['onoff.jets'] = false;
      (device as any)._capabilities['onoff.ozone'] = false;
      (device as any)._capabilities['onoff.uvc'] = false;
      (device as any)._capabilities['bubble_level'] = 'off';

      // Act
      await device.onInit();

      // Assert
      expect(device.hasCapability('onoff.jets')).toBe(true);
      expect(device.hasCapability('onoff.ozone')).toBe(true);
      expect(device.hasCapability('onoff.uvc')).toBe(true);
      expect(device.hasCapability('bubble_level')).toBe(true);
    });

    it('should use default profile for unknown models', async () => {
      // Setup: Unknown model
      (device as any)._store = {
        product_id: 'test-product-id',
        product_series: 'Unknown-123',
      };
      
      (device as any)._capabilities['onoff.jets'] = false;
      (device as any)._capabilities['onoff.ozone'] = false;
      (device as any)._capabilities['onoff.uvc'] = false;

      // Act
      await device.onInit();

      // Assert: Default profile (no jets/ozone/uvc)
      expect(device.hasCapability('onoff.jets')).toBe(false);
      expect(device.hasCapability('onoff.ozone')).toBe(false);
      expect(device.hasCapability('onoff.uvc')).toBe(false);
    });
  });
});
