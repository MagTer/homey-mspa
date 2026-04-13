import { vi } from 'vitest';

export class Device {
  public homey: any;
  private _store: any = {};
  private _data: any = { id: 'test-device' };
  private _capabilities: any = {};
  private _available: boolean = true;
  private _lastUnavailableMessage: string = '';
  private _capabilityListeners: any = {};

  constructor() {
    this.homey = {
      setTimeout: vi.fn().mockImplementation((fn) => setTimeout(fn, 0)),
      clearTimeout: vi.fn().mockImplementation((t) => clearTimeout(t)),
      setInterval: vi.fn().mockImplementation((fn) => setInterval(fn, 0)),
      clearInterval: vi.fn().mockImplementation((t) => clearInterval(t)),
      flow: {
        getDeviceTriggerCard: vi.fn((id) => ({
          trigger: vi.fn().mockResolvedValue(true),
        })),
      },
    };
  }

  log() {}
  error() {}
  getStore() { return this._store; }
  getStoreValue(key) { return this._store[key]; }
  setStoreValue(key, value) { this._store[key] = value; return Promise.resolve(); }
  getData() { return this._data; }
  setCapabilityValue(cid, val) { this._capabilities[cid] = val; return Promise.resolve(); }
  getCapabilityValue(cid) { return this._capabilities[cid]; }
  registerCapabilityListener(cid, handler) { this._capabilityListeners[cid] = handler; return Promise.resolve(); }
  setAvailable() { this._available = true; return Promise.resolve(); }
  setUnavailable(msg) { this._available = false; this._lastUnavailableMessage = msg; return Promise.resolve(); }
  getAvailable() { return this._available; }
  
  // Helper for tests
  async triggerCapabilityListener(cid, val) {
    if (this._capabilityListeners[cid]) {
      return this._capabilityListeners[cid](val);
    }
  }
}

export class Driver {
  public homey: any;
  constructor() {
    this.homey = {
      flow: {
        getConditionCard: vi.fn((id) => ({
          registerRunListener: vi.fn(),
        })),
        getActionCard: vi.fn((id) => ({
          registerRunListener: vi.fn(),
        })),
      },
    };
  }
  log() {}
  error() {}
}

const homey = {
  Device,
  Driver,
};

export default homey;
