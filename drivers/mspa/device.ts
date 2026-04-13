import Homey from 'homey';
import { MspaApiClient } from '../../lib/mspa-api/client.js';
import { parseShadow } from '../../lib/mspa-api/shadow.js';
import type { ParsedShadow } from '../../lib/mspa-api/types.js';

export default class MspaDevice extends Homey.Device {
  constructor(...args) {
    super(...args);
    this.apiClient = null;
    this.idlePollTimer = null;
    this.rapidPollTimer = null;
    this.rapidPollEndTime = null;
    this.consecutiveFailures = 0;
    this.isRapidPolling = false;
    this.previousShadow = null;
    this.wasAvailable = true;
    this.triggerCards = {};
  }

  async onInit() {
    this.log('M-Spa device initializing...');

    // Cache trigger cards
    this.triggerCards.temperature_changed = this.homey.flow.getDeviceTriggerCard('temperature_changed');
    this.triggerCards.fault_detected = this.homey.flow.getDeviceTriggerCard('fault_detected');
    this.triggerCards.device_online = this.homey.flow.getDeviceTriggerCard('device_online');
    this.triggerCards.device_offline = this.homey.flow.getDeviceTriggerCard('device_offline');

    // Read stored credentials
    const { region, email, passwordHash, product_id } = this.getStore();
    const deviceId = this.getData().id;

    if (!region || !email || !passwordHash || !product_id) {
      this.log('Missing store credentials');
      this.setUnavailable('Configuration incomplete. Please re-pair the device.');
      return;
    }

    // Construct API client with passwordHash
    try {
      this.apiClient = new MspaApiClient({ email, passwordHash, region });
      this.log('API client constructed');
    } catch (err) {
      this.log(`Failed to construct API client: ${err.message}`);
      this.setUnavailable('Configuration error. Please re-pair the device.');
      return;
    }

    // Authenticate
    try {
      await this.apiClient.authenticate();
      this.log('Authenticated successfully');
      this.consecutiveFailures = 0;
    } catch (err) {
      this.log(`Authentication failed: ${err.message}`);
      this.setUnavailable('Authentication failed. Check credentials.');
      return;
    }

    // Fetch initial shadow and sync
    try {
      const shadow = await this.apiClient.getThingShadow(deviceId, product_id);
      this.consecutiveFailures = 0;
      this.setAvailable();
      this.syncFromShadow(parseShadow(shadow));
      this.log('Initial shadow synced');
    } catch (err) {
      this.log(`Failed to fetch initial shadow: ${err.message}`);
      this.handleApiError();
    }

    // Register capability listeners for all controllable capabilities
    this.registerCapabilityListener('target_temperature', this.handleTargetTemperature.bind(this));
    this.registerCapabilityListener('onoff.heater', this.handleHeater.bind(this));
    this.registerCapabilityListener('onoff.filter', this.handleFilter.bind(this));
    this.registerCapabilityListener('bubble_level', this.handleBubbleLevel.bind(this));
    this.registerCapabilityListener('onoff.jets', this.handleJets.bind(this));
    this.registerCapabilityListener('onoff.ozone', this.handleOzone.bind(this));
    this.registerCapabilityListener('onoff.uvc', this.handleUvc.bind(this));

    this.log('Capability listeners registered');

    // Start idle polling (15-minute interval)
    this.startIdlePolling();

    this.log('M-Spa device initialized and available');
  }

  /**
   * Sync parsed shadow state to Homey capabilities
   */
  syncFromShadow(shadow: ParsedShadow) {
    this.log(`Syncing shadow: ${JSON.stringify(shadow)}`);

    // Detect changes and fire triggers (if not the first sync)
    if (this.previousShadow) {
      // Temperature changed
      if (shadow.water_temperature !== this.previousShadow.water_temperature) {
        this.log(`Firing temperature_changed trigger: ${shadow.water_temperature}`);
        this.triggerCards.temperature_changed.trigger(this, { temperature: shadow.water_temperature })
          .catch((err) => this.error(`Failed to fire temperature_changed trigger: ${err.message}`));
      }

      // Fault detected (only fire if it goes from no fault to fault)
      if (shadow.fault && shadow.fault !== '' && shadow.fault !== this.previousShadow.fault) {
        this.log(`Firing fault_detected trigger: ${shadow.fault}`);
        this.triggerCards.fault_detected.trigger(this, { fault_code: shadow.fault })
          .catch((err) => this.error(`Failed to fire fault_detected trigger: ${err.message}`));
      }
    }

    // Map temperature values
    this.setCapabilityValue('measure_temperature', shadow.water_temperature);
    this.setCapabilityValue('target_temperature', shadow.temperature_setting);

    // Map on/off capabilities
    this.setCapabilityValue('onoff.heater', shadow.heater_state);
    this.setCapabilityValue('onoff.filter', shadow.filter_state);
    this.setCapabilityValue('onoff.jets', shadow.jet_state);
    this.setCapabilityValue('onoff.ozone', shadow.ozone_state);
    this.setCapabilityValue('onoff.uvc', shadow.uvc_state);

    // Map bubble level (number 0-3 to enum string)
    const bubbleValue = shadow.bubble_level === 0 ? 'off' : String(shadow.bubble_level);
    this.setCapabilityValue('bubble_level', bubbleValue);

    // Map active sensors from shadow
    this.setCapabilityValue('heater_active', shadow.heater_state);
    this.setCapabilityValue('filter_active', shadow.filter_state);

    // Handle fault state
    if (shadow.fault && shadow.fault !== '') {
      this.setUnavailable(`Spa reported fault: ${shadow.fault}`);
      this.log(`Spa fault detected: ${shadow.fault}`);
    }

    // Update previous shadow for next sync
    this.previousShadow = shadow;
  }

  /**
   * Handle target temperature capability change
   */
  async handleTargetTemperature(value) {
    this.log(`target_temperature changed to ${value}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    // API uses 2x values
    const apiValue = value * 2;

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { temperature_setting: apiValue });
      this.log('Temperature command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send temperature command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle heater capability change
   */
  async handleHeater(value) {
    this.log(`heater changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { heater_state: value ? 1 : 0 });
      this.log('Heater command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send heater command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle filter capability change with constraint enforcement
   */
  async handleFilter(value) {
    this.log(`filter changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    // D003: Filter constraint - if filter is turned off, turn off heater
    if (!value) {
      const heaterValue = this.getCapabilityValue('onoff.heater');
      if (heaterValue) {
        this.log('Filter constraint: turning off heater when filter turns off');
        try {
          await this.apiClient.sendCommand(deviceId, product_id, { heater_state: 0 });
          this.setCapabilityValue('onoff.heater', false);
          this.log('Heater turned off via filter constraint');
        } catch (err) {
          this.log(`Failed to enforce filter constraint on heater: ${err.message}`);
        }
      }
    }

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { filter_state: value ? 1 : 0 });
      this.log('Filter command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send filter command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle bubble level capability change
   */
  async handleBubbleLevel(value) {
    this.log(`bubble_level changed to ${value}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    // Convert enum string to number: 'off' -> 0, '1' -> 1, '2' -> 2, '3' -> 3
    const apiValue = value === 'off' ? 0 : parseInt(value, 10);

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { bubble_level: apiValue });
      this.log('Bubble level command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send bubble level command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle jets capability change
   */
  async handleJets(value) {
    this.log(`jets changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { jet_state: value ? 1 : 0 });
      this.log('Jets command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send jets command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle ozone capability change
   */
  async handleOzone(value) {
    this.log(`ozone changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { ozone_state: value ? 1 : 0 });
      this.log('Ozone command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send ozone command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle UVC capability change
   */
  async handleUvc(value) {
    this.log(`uvc changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id) {
      this.log('Missing device or product ID');
      return;
    }

    try {
      await this.apiClient.sendCommand(deviceId, product_id, { uvc_state: value ? 1 : 0 });
      this.log('UVC command sent');
      this.startRapidPolling();
    } catch (err) {
      this.log(`Failed to send UVC command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start idle polling (15-minute interval)
   */
  startIdlePolling() {
    if (this.idlePollTimer) {
      this.homey.clearTimeout(this.idlePollTimer);
    }

    this.idlePollTimer = this.homey.setInterval(async () => {
      this.log('Idle poll cycle starting');
      await this.performPoll();
    }, 900000); // 15 minutes = 900000ms

    this.log('Idle polling started (15min interval)');
  }

  /**
   * Start rapid polling (5 seconds for 30 seconds after any command)
   */
  startRapidPolling() {
    // Cancel any existing rapid polling
    if (this.rapidPollTimer) {
      this.homey.clearTimeout(this.rapidPollTimer);
    }

    // Cancel idle polling during rapid polling
    if (this.idlePollTimer) {
      this.homey.clearTimeout(this.idlePollTimer);
      this.idlePollTimer = null;
    }

    this.isRapidPolling = true;
    const rapidPollInterval = 5000; // 5 seconds
    const rapidPollDuration = 30000; // 30 seconds
    const pollCount = rapidPollDuration / rapidPollInterval;
    let pollCountRemaining = pollCount;

    this.log(`Starting rapid polling (${rapidPollDuration}ms / ${pollCount} polls)`);

    const rapidPoll = async () => {
      pollCountRemaining--;
      this.log(`Rapid poll #${pollCount - pollCountRemaining}/${pollCount}`);

      await this.performPoll();

      if (pollCountRemaining > 0) {
        this.rapidPollTimer = this.homey.setTimeout(rapidPoll, rapidPollInterval);
      } else {
        this.isRapidPolling = false;
        this.rapidPollTimer = null;
        this.log('Rapid polling complete, resuming idle polling');
        this.startIdlePolling();
      }
    };

    this.rapidPollTimer = this.homey.setTimeout(rapidPoll, rapidPollInterval);
  }

  /**
   * Perform a single poll cycle
   */
  async performPoll() {
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;

    if (!deviceId || !product_id || !this.apiClient) {
      this.log('Missing device, product ID, or API client');
      return;
    }

    try {
      const shadow = await this.apiClient.getThingShadow(deviceId, product_id);
      this.consecutiveFailures = 0;
      
      if (!this.wasAvailable) {
        this.log('Device recovered, firing device_online trigger');
        this.triggerCards.device_online.trigger(this)
          .catch((err) => this.error(`Failed to fire device_online trigger: ${err.message}`));
        this.wasAvailable = true;
      }
      
      this.setAvailable();
      this.syncFromShadow(parseShadow(shadow));
      this.log('Poll successful');
    } catch (err) {
      this.log(`Poll failed: ${err.message}`);
      this.handleApiError();
    }
  }

  /**
   * Handle API errors and update availability
   */
  handleApiError() {
    this.consecutiveFailures++;
    this.log(`API failure #${this.consecutiveFailures}`);

    if (this.consecutiveFailures >= 3) {
      if (this.wasAvailable) {
        this.log('Device unreachable, firing device_offline trigger');
        this.triggerCards.device_offline.trigger(this)
          .catch((err) => this.error(`Failed to fire device_offline trigger: ${err.message}`));
        this.wasAvailable = false;
      }
      this.setUnavailable('Could not reach your spa. If it was just powered on, the WiFi module may still be connecting.');
    }
  }

  /**
   * Cleanup timers on device deletion
   */
  async onDeleted() {
    this.log('M-Spa device being deleted');

    if (this.idlePollTimer) {
      this.homey.clearTimeout(this.idlePollTimer);
      this.idlePollTimer = null;
    }

    if (this.rapidPollTimer) {
      this.homey.clearTimeout(this.rapidPollTimer);
      this.rapidPollTimer = null;
    }

    this.log('Timers cleared');
  }
}
