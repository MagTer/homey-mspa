/**
 * M-Spa Panel Widget API
 * Status + control for the interactive control-panel widget.
 */

function getMspaDevices(homey) {
  try {
    const driver = homey.drivers.getDriver('mspa');
    return driver.getDevices();
  } catch {
    return [];
  }
}

async function resolveDevice(homey, deviceId) {
  const devices = getMspaDevices(homey);
  if (!devices.length) return null;

  if (deviceId) {
    for (const d of devices) {
      await d.ready();
      if (d.getId() === deviceId || String((d.getData() || {}).id) === String(deviceId)) {
        return d;
      }
    }
  }

  // Single spa → auto-select
  if (devices.length === 1) {
    await devices[0].ready();
    return devices[0];
  }

  return null;
}

/** Optional caps the physical panel exposes; force-add like Flow THEN cards. */
const FORCEABLE_CAPS = ['mspa_jets', 'mspa_ozone', 'mspa_uvc', 'bubble_level'];

async function ensureCapability(device, capability) {
  if (device.hasCapability(capability)) return true;
  if (typeof device.ensureOptionalCapability === 'function') {
    return device.ensureOptionalCapability(capability);
  }
  if (!FORCEABLE_CAPS.includes(capability)) return false;
  try {
    await device.addCapability(capability);
    return device.hasCapability(capability);
  } catch {
    return false;
  }
}

function readStatus(device) {
  const has = (cap) => device.hasCapability(cap);
  const get = (cap, fallback = null) => (has(cap) ? device.getCapabilityValue(cap) : fallback);

  return {
    id: device.getId(),
    dataId: (device.getData() || {}).id || null,
    name: device.getName(),
    available: device.getAvailable(),
    measure_temperature: get('measure_temperature'),
    target_temperature: get('target_temperature'),
    mspa_heater: !!get('mspa_heater', false),
    mspa_filter: !!get('mspa_filter', false),
    // null only if we refuse control; Düse is always offered on the panel widget
    mspa_jets: has('mspa_jets') ? !!get('mspa_jets', false) : false,
    mspa_ozone: has('mspa_ozone') ? !!get('mspa_ozone', false) : null,
    mspa_uvc: has('mspa_uvc') ? !!get('mspa_uvc', false) : null,
    bubble_level: has('bubble_level') ? get('bubble_level', 'off') : null,
    heater_active: has('heater_active') ? !!get('heater_active', false) : !!get('mspa_heater', false),
    filter_active: has('filter_active') ? !!get('filter_active', false) : !!get('mspa_filter', false),
    features: {
      // Always show Düse (physical panel); capability is force-added on first toggle
      jets: true,
      ozone: has('mspa_ozone'),
      uvc: has('mspa_uvc'),
      bubbles: has('bubble_level'),
    },
  };
}

export default {
  async listDevices({ homey }) {
    const devices = getMspaDevices(homey);
    const out = [];
    for (const d of devices) {
      await d.ready();
      out.push({ id: d.getId(), name: d.getName() });
    }
    return out;
  },

  async getStatus({ homey, query }) {
    const device = await resolveDevice(homey, query.deviceId);
    if (!device) {
      return { error: 'no_device', message: 'No M-Spa device selected' };
    }
    return readStatus(device);
  },

  async toggle({ homey, body }) {
    const { deviceId, capability } = body || {};
    const allowed = ['mspa_heater', 'mspa_filter', 'mspa_jets', 'mspa_ozone', 'mspa_uvc'];
    if (!allowed.includes(capability)) {
      throw new Error(`Unsupported capability: ${capability}`);
    }

    const device = await resolveDevice(homey, deviceId);
    if (!device) throw new Error('Device not found');

    // Frame/Oslo profile may strip mspa_jets; restore like Flow THEN (force-add)
    if (!device.hasCapability(capability)) {
      const ok = await ensureCapability(device, capability);
      if (!ok) {
        throw new Error(`Device has no capability ${capability}`);
      }
    }

    const current = !!device.getCapabilityValue(capability);
    const next = !current;
    await device.triggerCapabilityListener(capability, next);
    return { success: true, capability, value: next, ...readStatus(device) };
  },

  async setTemperature({ homey, body }) {
    const { deviceId, delta, value } = body || {};
    const device = await resolveDevice(homey, deviceId);
    if (!device) throw new Error('Device not found');
    if (!device.hasCapability('target_temperature')) {
      throw new Error('No target_temperature capability');
    }

    let next;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      next = value;
    } else {
      const current = Number(device.getCapabilityValue('target_temperature'));
      const base = Number.isFinite(current) ? current : 37;
      const step = typeof delta === 'number' ? delta : 0.5;
      next = base + step;
    }

    // Match driver limits
    next = Math.round(next * 2) / 2;
    next = Math.min(42, Math.max(20, next));

    await device.triggerCapabilityListener('target_temperature', next);
    return { success: true, target_temperature: next, ...readStatus(device) };
  },

  async cycleBubble({ homey, body }) {
    const { deviceId } = body || {};
    const device = await resolveDevice(homey, deviceId);
    if (!device) throw new Error('Device not found');
    if (!device.hasCapability('bubble_level')) {
      throw new Error('No bubble_level capability');
    }

    const order = ['off', '1', '2', '3'];
    const current = device.getCapabilityValue('bubble_level') || 'off';
    const idx = order.indexOf(String(current));
    const next = order[(idx < 0 ? 0 : idx + 1) % order.length];

    await device.triggerCapabilityListener('bubble_level', next);
    return { success: true, bubble_level: next, ...readStatus(device) };
  },
};
