import Homey from 'homey';
import { MspaApiClient } from '../../lib/mspa-api/client.js';
import * as crypto from 'node:crypto';

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

    // Register Flow Actions
    this.homey.flow.getActionCard('set_temperature')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('target_temperature', args.temperature);
      });

    this.homey.flow.getActionCard('toggle_heater')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('onoff.heater', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_filter')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('onoff.filter', args.state === 'on');
      });

    this.homey.flow.getActionCard('set_bubble_level')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('bubble_level', args.level);
      });

    this.homey.flow.getActionCard('toggle_jets')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('onoff.jets', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_ozone')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('onoff.ozone', args.state === 'on');
      });

    this.homey.flow.getActionCard('toggle_uvc')
      .registerRunListener(async (args) => {
        return args.device.triggerCapabilityListener('onoff.uvc', args.state === 'on');
      });
  }

  async onPair(session) {
    this.log('M-Spa driver pairing started');

    // Closure variables to persist state across pair steps
    let region = null;
    let client = null;
    let email = null;
    let password = null;

    // Step 1: select_region - Store user's region choice
    session.setHandler('select_region', async (regionCode) => {
      this.log(`Region selected: ${regionCode}`);
      region = regionCode;
    });

    // Step 2: login_credentials - Authenticate with credentials
    session.setHandler('login', async (data) => {
      this.log('Attempting login with credentials');
      
      if (!data.username || !data.password) {
        throw new Error('Username and password are required');
      }

      email = data.username;
      password = data.password;

      try {
        client = new MspaApiClient({
          email: data.username,
          password: data.password,
          region: region,
        });

        const token = await client.authenticate();
        this.log('Authentication successful');
      } catch (error) {
        this.log(`Authentication failed: ${error.message}`);
        throw error;
      }
    });

    // Step 3: list_devices - Get list of devices and filter duplicates
    session.setHandler('list_devices', async () => {
      this.log('Fetching device list');

      if (!client) {
        throw new Error('Authentication required before listing devices');
      }

      try {
        const devices = await client.getDevices();
        this.log(`Received ${devices.length} devices from API`);

        // Get already paired devices to filter out duplicates
        const pairedDevices = this.getDevices();
        const pairedDeviceIds = pairedDevices.map(d => d.getData().id);

        this.log(`Found ${pairedDeviceIds.length} already paired devices`);

        // Filter out devices that are already paired
        const availableDevices = devices.filter(
          device => !pairedDeviceIds.includes(device.device_id)
        );

        this.log(`${availableDevices.length} devices available for pairing`);

        // Format devices for Homey pairing
        return availableDevices.map(device => ({
          name: device.device_alias,
          data: {
            id: device.device_id,
          },
          store: {
            product_id: device.product_id,
            region: region,
            email: email,
            passwordHash: crypto.createHash('md5').update(password).digest('hex'),
          },
        }));
      } catch (error) {
        this.log(`Failed to fetch devices: ${error.message}`);
        throw error;
      }
    });

    this.log('Driver pairing handlers registered');
  }
}
