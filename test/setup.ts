import { vi } from 'vitest';

// The App stub carries a working settings store so app.ts — which owns the
// shared MspaApiClient and rebuilds it on every settings change — can be
// exercised. Defined via vi.hoisted because vi.mock factories are hoisted
// above module scope and cannot close over ordinary consts.
const { AppStub } = vi.hoisted(() => {
  class AppStub {
    homey: any;
    _settings: Record<string, any> = {};
    _settingsListeners: Record<string, Function[]> = {};

    constructor() {
      const self = this;
      this.homey = {
        settings: {
          get: (key: string) => self._settings[key],
          set: (key: string, value: any) => {
            self._settings[key] = value;
            for (const fn of self._settingsListeners.set ?? []) fn(key);
          },
          unset: (key: string) => {
            delete self._settings[key];
            for (const fn of self._settingsListeners.set ?? []) fn(key);
          },
          on: (event: string, fn: Function) => {
            (self._settingsListeners[event] ??= []).push(fn);
          },
        },
      };
    }

    log() {}
    error() {}

    /** Test helper: seed settings without firing listeners. */
    __seedSettings(values: Record<string, any>) {
      Object.assign(this._settings, values);
    }
  }
  return { AppStub };
});

// Global mock for the Homey SDK
vi.mock('homey', () => {
  return {
    default: {
      App: AppStub,
      Device: class {
        constructor() {
          this.homey = {
            setTimeout: vi.fn(),
            clearTimeout: vi.fn(),
            setInterval: vi.fn(),
            clearInterval: vi.fn(),
          };
        }
        log() {}
        error() {}
        getStore() { return {}; }
        getStoreValue() { return null; }
        setStoreValue() {}
        getData() { return { id: 'test-device' }; }
        setCapabilityValue() { return Promise.resolve(); }
        getCapabilityValue() { return null; }
        registerCapabilityListener() {}
        setAvailable() { return Promise.resolve(); }
        setUnavailable() { return Promise.resolve(); }
        onInit() {}
        onDeleted() {}
      },
      Driver: class {
        log() {}
        error() {}
        onPair() {}
        getDevices() { return []; }
      },
      ManagerApi: {
        getOwnerGuid: vi.fn().mockResolvedValue('test-guid'),
      },
    },
    App: AppStub,
    Device: class {
      constructor() {
        this.homey = {
          setTimeout: vi.fn(),
          clearTimeout: vi.fn(),
          setInterval: vi.fn(),
          clearInterval: vi.fn(),
        };
      }
      log() {}
      error() {}
      getStore() { return {}; }
      getStoreValue() { return null; }
      setStoreValue() {}
      getData() { return { id: 'test-device' }; }
      setCapabilityValue() { return Promise.resolve(); }
      getCapabilityValue() { return null; }
      registerCapabilityListener() {}
      setAvailable() { return Promise.resolve(); }
      setUnavailable() { return Promise.resolve(); }
      onInit() {}
      onDeleted() {}
    },
    Driver: class {
      log() {}
      error() {}
      onPair() {}
      getDevices() { return []; }
    },
  };
});
