import Homey from 'homey';
import { MspaApiClient } from '../../lib/mspa-api/client.js';
import MspaApp from '../../app.js';

/** Homey inverts conditions automatically — always return a real boolean. */
function isOn(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export default class MspaDriver extends Homey.Driver {
  async onInit() {
    this.log('MspaDriver has been initialized');

    // Register Flow Conditions (return strict boolean so invert works)
    this.homey.flow.getConditionCard('heater_is_active')
      .registerRunListener(async (args) => {
        return isOn(args.device.getCapabilityValue('heater_active'))
          || isOn(args.device.getCapabilityValue('mspa_heater'));
      });

    this.homey.flow.getConditionCard('filter_is_active')
      .registerRunListener(async (args) => {
        return isOn(args.device.getCapabilityValue('filter_active'))
          || isOn(args.device.getCapabilityValue('mspa_filter'));
      });

    // Optional features: capability value, else last shadow (Homey invert needs real boolean)
    this.homey.flow.getConditionCard('jets_is_active')
      .registerRunListener(async (args) => {
        const device = args.device as any;
        if (typeof device.isBooleanFeatureOn === 'function') {
          return device.isBooleanFeatureOn('mspa_jets', 'jet_state');
        }
        if (!device.hasCapability('mspa_jets')) return false;
        return isOn(device.getCapabilityValue('mspa_jets'));
      });

    this.homey.flow.getConditionCard('ozone_is_active')
      .registerRunListener(async (args) => {
        const device = args.device as any;
        // If cap was dropped wrongly, try re-add once so Flow matches device UI
        if (!device.hasCapability('mspa_ozone')
          && typeof device.ensureOptionalCapability === 'function') {
          await device.ensureOptionalCapability('mspa_ozone');
        }
        if (typeof device.isBooleanFeatureOn === 'function') {
          return device.isBooleanFeatureOn('mspa_ozone', 'ozone_state');
        }
        if (!device.hasCapability('mspa_ozone')) return false;
        return isOn(device.getCapabilityValue('mspa_ozone'));
      });

    this.homey.flow.getConditionCard('uvc_is_active')
      .registerRunListener(async (args) => {
        const device = args.device as any;
        if (typeof device.isBooleanFeatureOn === 'function') {
          return device.isBooleanFeatureOn('mspa_uvc', 'uvc_state');
        }
        if (!device.hasCapability('mspa_uvc')) return false;
        return isOn(device.getCapabilityValue('mspa_uvc'));
      });

    this.homey.flow.getConditionCard('bubbles_is_active')
      .registerRunListener(async (args) => {
        const device = args.device;
        if (!device.hasCapability('bubble_level')) return false;
        const level = device.getCapabilityValue('bubble_level');
        if (level == null || level === 'off' || level === 0 || level === '0') return false;
        return true;
      });

    // Measured water temperature (measure_temperature), strict comparison
    this.homey.flow.getConditionCard('temperature_above')
      .registerRunListener(async (args) => {
        const raw = args.device.getCapabilityValue('measure_temperature');
        if (raw === null || raw === undefined) return false;
        const currentTemp = Number(raw);
        const threshold = Number(args.temperature);
        if (!Number.isFinite(currentTemp) || !Number.isFinite(threshold)) return false;
        return currentTemp > threshold;
      });

    this.homey.flow.getConditionCard('temperature_below')
      .registerRunListener(async (args) => {
        const raw = args.device.getCapabilityValue('measure_temperature');
        if (raw === null || raw === undefined) return false;
        const currentTemp = Number(raw);
        const threshold = Number(args.temperature);
        if (!Number.isFinite(currentTemp) || !Number.isFinite(threshold)) return false;
        return currentTemp < threshold;
      });

    // Exact target temperature (0.5°C steps)
    this.homey.flow.getConditionCard('temperature_equals')
      .registerRunListener(async (args) => {
        const raw = args.device.getCapabilityValue('target_temperature');
        if (raw === null || raw === undefined) return false;
        const setTemp = Number(raw);
        const want = Number(args.temperature);
        if (!Number.isFinite(setTemp) || !Number.isFinite(want)) return false;
        return roundHalf(setTemp) === roundHalf(want);
      });

    // Register Flow Actions
    this.homey.flow.getActionCard('set_temperature')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('target_temperature', args.temperature);
      });

    this.homey.flow.getActionCard('toggle_heater')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('mspa_heater', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_filter')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('mspa_filter', args.state === 'on');
      });

    this.homey.flow.getActionCard('set_bubble_level')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('bubble_level', args.level);
      });

    this.homey.flow.getActionCard('toggle_jets')
      .registerRunListener(async (args) => {
        return this.toggleOptionalBoolean(args.device, 'mspa_jets', args.state === 'on', 'jets');
      });

    this.homey.flow.getActionCard('toggle_ozone')
      .registerRunListener(async (args) => {
        return this.toggleOptionalBoolean(args.device, 'mspa_ozone', args.state === 'on', 'ozone');
      });

    this.homey.flow.getActionCard('toggle_uvc')
      .registerRunListener(async (args) => {
        return this.toggleOptionalBoolean(args.device, 'mspa_uvc', args.state === 'on', 'UVC');
      });
  }

  /**
   * Flow THEN: set optional boolean capability safely.
   * Re-adds the capability if the profile supports it (fixes invalid_capability
   * after the cap was removed once and never restored).
   */
  private async toggleOptionalBoolean(
    device: any,
    capabilityId: string,
    on: boolean,
    label: string,
  ): Promise<void> {
    if (!device.hasCapability(capabilityId)
      && typeof device.ensureOptionalCapability === 'function') {
      await device.ensureOptionalCapability(capabilityId);
    }
    if (!device.hasCapability(capabilityId)) {
      throw new Error(
        `This spa model has no ${label} control (capability ${capabilityId} missing).`,
      );
    }
    await device.triggerCapabilityListener(capabilityId, on);
  }

  async onPair(session: any) {
    this.log('M-Spa driver pairing started');

    const app = this.homey.app as MspaApp;

    session.setHandler('list_devices', async () => {
      this.log('Fetching spa device list');

      // Resolve the API client on every request so that settings changes made
      // while the pairing wizard is open (a common retry path) take effect.
      const client = app.getApiClient();
      if (!client) {
        throw new Error('Please configure your M-Spa account (Email, Password, Region) in the app settings first.');
      }

      try {
        await client.authenticate();
        const devices = await client.getDevices();
        this.log(`Received ${devices.length} devices from API`);

        const pairedDevices = this.getDevices();
        const pairedDeviceIds = pairedDevices.map(d => (d.getData() as any).id);

        const availableDevices = devices.filter(
          device => !pairedDeviceIds.includes(device.device_id)
        );

        return availableDevices.map(device => ({
          name: device.device_alias,
          data: {
            id: device.device_id,
          },
          store: {
            product_id: device.product_id,
            product_series: device.product_series,
            product_model: device.product_model,
            // Sensitive credentials (email, passwordHash, region) are no longer stored per-device
            // They are strictly resolved from global app settings.
          },
        }));
      } catch (error: any) {
        this.log(`Failed to fetch devices: ${error.message}`);
        throw error;
      }
    });

    this.log('Driver pairing handlers registered');
  }
}
