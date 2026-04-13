import { vi } from 'vitest';

// Global mock for the Homey SDK
vi.mock('homey', () => {
  return {
    default: {
      App: class {
        log() {}
        error() {}
      },
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
    App: class {
      log() {}
      error() {}
    },
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
