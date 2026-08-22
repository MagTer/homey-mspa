/**
 * Dashboard widget backend tests
 *
 * widgets/mspa-panel/api.js had no typecheck and no test at all, despite being
 * the path that every widget tick, button press and temperature change goes
 * through. It is ordinary Node code, so it mocks the same way driver.ts does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-expect-error - plain JS module without type declarations
import api from '../../widgets/mspa-panel/api.js';

type Caps = Record<string, unknown>;

function makeDevice(opts: {
  id?: string;
  dataId?: string;
  name?: string;
  caps?: Caps;
  available?: boolean;
  refreshIfStale?: any;
} = {}) {
  const caps: Caps = opts.caps ?? {
    measure_temperature: 38,
    target_temperature: 40,
    mspa_heater: true,
    mspa_filter: true,
    heater_active: true,
    filter_active: true,
  };
  return {
    getId: () => opts.id ?? 'dev-1',
    getData: () => ({ id: opts.dataId ?? 'data-1' }),
    getName: () => opts.name ?? 'Spa',
    getAvailable: () => opts.available ?? true,
    ready: vi.fn().mockResolvedValue(undefined),
    hasCapability: (c: string) => c in caps,
    getCapabilityValue: (c: string) => caps[c],
    addCapability: vi.fn(async (c: string) => { caps[c] = false; }),
    triggerCapabilityListener: vi.fn(async (c: string, v: unknown) => { caps[c] = v; }),
    refreshIfStale: opts.refreshIfStale,
    _caps: caps,
  };
}

function makeHomey(devices: any[]) {
  return {
    drivers: { getDriver: () => ({ getDevices: () => devices }) },
  } as any;
}

describe('mspa-panel widget api', () => {
  describe('getStatus', () => {
    it('refreshes a stale shadow before reading capabilities', async () => {
      const refreshIfStale = vi.fn().mockResolvedValue(undefined);
      const device = makeDevice({ refreshIfStale });
      const res = await api.getStatus({ homey: makeHomey([device]), query: {} });

      expect(refreshIfStale).toHaveBeenCalledTimes(1);
      expect(res.measure_temperature).toBe(38);
    });

    it('still returns last known values when the refresh throws', async () => {
      // A failing cloud must not blank the panel.
      const refreshIfStale = vi.fn().mockRejectedValue(new Error('cloud down'));
      const device = makeDevice({ refreshIfStale });
      const res = await api.getStatus({ homey: makeHomey([device]), query: {} });

      expect(res.error).toBeUndefined();
      expect(res.measure_temperature).toBe(38);
      expect(res.mspa_heater).toBe(true);
    });

    it('works against a device that predates refreshIfStale', async () => {
      const device = makeDevice({ refreshIfStale: undefined });
      const res = await api.getStatus({ homey: makeHomey([device]), query: {} });
      expect(res.name).toBe('Spa');
    });

    it('reports no_device when no spa is paired', async () => {
      const res = await api.getStatus({ homey: makeHomey([]), query: {} });
      expect(res.error).toBe('no_device');
    });

    it('does not auto-select when several spas are paired and none is named', async () => {
      const res = await api.getStatus({
        homey: makeHomey([makeDevice({ id: 'a' }), makeDevice({ id: 'b' })]),
        query: {},
      });
      expect(res.error).toBe('no_device');
    });

    it('selects the requested spa by id when several are paired', async () => {
      const a = makeDevice({ id: 'a', name: 'Alpha' });
      const b = makeDevice({ id: 'b', name: 'Beta' });
      const res = await api.getStatus({ homey: makeHomey([a, b]), query: { deviceId: 'b' } });
      expect(res.name).toBe('Beta');
    });

    it('reports optional features as null when the capability is absent', async () => {
      const device = makeDevice({ caps: { measure_temperature: 38, mspa_heater: false } });
      const res = await api.getStatus({ homey: makeHomey([device]), query: {} });
      expect(res.mspa_ozone).toBeNull();
      expect(res.mspa_uvc).toBeNull();
      expect(res.bubble_level).toBeNull();
      expect(res.features.ozone).toBe(false);
      expect(res.features.jets).toBe(true); // panel always offers jets
    });

    it('surfaces availability', async () => {
      const device = makeDevice({ available: false });
      const res = await api.getStatus({ homey: makeHomey([device]), query: {} });
      expect(res.available).toBe(false);
    });
  });

  describe('toggle', () => {
    it('flips the capability and reports the new value', async () => {
      const device = makeDevice();
      const res = await api.toggle({
        homey: makeHomey([device]),
        body: { deviceId: 'dev-1', capability: 'mspa_heater' },
      });
      expect(res.value).toBe(false);
      expect(device.triggerCapabilityListener).toHaveBeenCalledWith('mspa_heater', false);
    });

    it('rejects a capability that is not on the allow-list', async () => {
      await expect(api.toggle({
        homey: makeHomey([makeDevice()]),
        body: { deviceId: 'dev-1', capability: 'target_temperature' },
      })).rejects.toThrow(/Unsupported capability/);
    });

    it('rejects an unknown capability name outright', async () => {
      await expect(api.toggle({
        homey: makeHomey([makeDevice()]),
        body: { deviceId: 'dev-1', capability: 'evil' },
      })).rejects.toThrow(/Unsupported capability/);
    });

    it('force-adds a forceable capability the profile stripped', async () => {
      const device = makeDevice({ caps: { mspa_heater: true } });
      const res = await api.toggle({
        homey: makeHomey([device]),
        body: { deviceId: 'dev-1', capability: 'mspa_jets' },
      });
      expect(device.addCapability).toHaveBeenCalledWith('mspa_jets');
      expect(res.success).toBe(true);
    });

    it('throws when there is no device', async () => {
      await expect(api.toggle({
        homey: makeHomey([]),
        body: { deviceId: 'x', capability: 'mspa_heater' },
      })).rejects.toThrow(/Device not found/);
    });
  });

  describe('setTemperature', () => {
    it('applies an explicit value', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', value: 38 },
      });
      expect(res.target_temperature).toBe(38);
    });

    it('applies a delta to the current target', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', delta: -1 },
      });
      expect(res.target_temperature).toBe(39);
    });

    it('defaults to a +0.5 step when neither value nor delta is given', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1' },
      });
      expect(res.target_temperature).toBe(40.5);
    });

    it('clamps above the driver maximum', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', value: 99 },
      });
      expect(res.target_temperature).toBe(42);
    });

    it('clamps below the driver minimum', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', value: -5 },
      });
      expect(res.target_temperature).toBe(20);
    });

    it('rounds to the nearest half degree', async () => {
      const device = makeDevice();
      const res = await api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', value: 38.3 },
      });
      expect(res.target_temperature).toBe(38.5);
    });

    it('throws when the capability is missing', async () => {
      const device = makeDevice({ caps: { mspa_heater: true } });
      await expect(api.setTemperature({
        homey: makeHomey([device]), body: { deviceId: 'dev-1', value: 38 },
      })).rejects.toThrow(/No target_temperature/);
    });
  });

  describe('cycleBubble', () => {
    it('steps off -> 1 -> 2 -> 3 -> off', async () => {
      const caps: Caps = { bubble_level: 'off' };
      const device = makeDevice({ caps });
      const homey = makeHomey([device]);

      for (const expected of ['1', '2', '3', 'off']) {
        const res = await api.cycleBubble({ homey, body: { deviceId: 'dev-1' } });
        expect(res.bubble_level).toBe(expected);
      }
    });

    it('falls back to off from an unrecognized value', async () => {
      // indexOf returns -1, which the cycle maps to order[0] rather than to the
      // next step. Documenting current behaviour, not endorsing it: from an
      // unknown state the first press appears to do nothing and the user has to
      // press twice. Harmless, and not worth a behaviour change in a test PR.
      const device = makeDevice({ caps: { bubble_level: 'nonsense' } });
      const res = await api.cycleBubble({
        homey: makeHomey([device]), body: { deviceId: 'dev-1' },
      });
      expect(res.bubble_level).toBe('off');
    });

    it('throws when the capability is missing', async () => {
      const device = makeDevice({ caps: { mspa_heater: true } });
      await expect(api.cycleBubble({
        homey: makeHomey([device]), body: { deviceId: 'dev-1' },
      })).rejects.toThrow(/No bubble_level/);
    });
  });

  describe('listDevices', () => {
    it('lists id and name for each paired spa', async () => {
      const list = await api.listDevices({
        homey: makeHomey([makeDevice({ id: 'a', name: 'Alpha' }), makeDevice({ id: 'b', name: 'Beta' })]),
      });
      expect(list).toEqual([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
    });

    it('returns an empty list when the driver is unavailable', async () => {
      const homey = { drivers: { getDriver: () => { throw new Error('no driver'); } } } as any;
      expect(await api.listDevices({ homey })).toEqual([]);
    });
  });
});
