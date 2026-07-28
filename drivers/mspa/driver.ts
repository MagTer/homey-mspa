import Homey from 'homey';
import { MspaApiClient } from '../../lib/mspa-api/client.js';
import MspaApp from '../../app.js';

export default class MspaDriver extends Homey.Driver {
  async onInit() {
    this.log('MspaDriver has been initialized');

    // Register Flow Conditions
    this.homey.flow.getConditionCard('heater_is_active')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('heater_active') === true;
      });

    this.homey.flow.getConditionCard('filter_is_active')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('filter_active') === true;
      });

    // Optional features: only true if capability exists and state is on
    this.homey.flow.getConditionCard('jets_is_active')
      .registerRunListener(async (args) => {
        const device = args.device;
        if (!device.hasCapability('mspa_jets')) return false;
        return device.getCapabilityValue('mspa_jets') === true;
      });

    this.homey.flow.getConditionCard('ozone_is_active')
      .registerRunListener(async (args) => {
        const device = args.device;
        if (!device.hasCapability('mspa_ozone')) return false;
        return device.getCapabilityValue('mspa_ozone') === true;
      });

    this.homey.flow.getConditionCard('uvc_is_active')
      .registerRunListener(async (args) => {
        const device = args.device;
        if (!device.hasCapability('mspa_uvc')) return false;
        return device.getCapabilityValue('mspa_uvc') === true;
      });

    this.homey.flow.getConditionCard('bubbles_is_active')
      .registerRunListener(async (args) => {
        const device = args.device;
        if (!device.hasCapability('bubble_level')) return false;
        const level = device.getCapabilityValue('bubble_level');
        return level != null && level !== 'off' && level !== 0 && level !== '0';
      });

    this.homey.flow.getConditionCard('temperature_above')
      .registerRunListener(async (args) => {
        const currentTemp = args.device.getCapabilityValue('measure_temperature');
        return currentTemp >= args.temperature;
      });

    this.homey.flow.getConditionCard('temperature_below')
      .registerRunListener(async (args) => {
        const currentTemp = args.device.getCapabilityValue('measure_temperature');
        return currentTemp <= args.temperature;
      });

    // Exakte Temperatur (0,5°C-Raster wie M-Spa-Anzeige)
    this.homey.flow.getConditionCard('temperature_equals')
      .registerRunListener(async (args) => {
        const currentTemp = Number(args.device.getCapabilityValue('measure_temperature'));
        const target = Number(args.temperature);
        if (!Number.isFinite(currentTemp) || !Number.isFinite(target)) return false;
        const roundHalf = (n: number) => Math.round(n * 2) / 2;
        return roundHalf(currentTemp) === roundHalf(target);
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
        return args.device.triggerCapabilityListener('mspa_jets', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_ozone')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('mspa_ozone', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_uvc')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('mspa_uvc', args.state === 'on');
      });
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
