import Homey from 'homey';
import { MspaApiClient } from '../../lib/mspa-api/client.js';
import { isActivelyHeating, parseShadow } from '../../lib/mspa-api/shadow.js';
import type { ParsedShadow } from '../../lib/mspa-api/types.js';
import { getProfile } from '../../lib/mspa-api/profiles.js';
import MspaApp from '../../app.js';

export default class MspaDevice extends Homey.Device {
  private idlePollTimer: NodeJS.Timeout | null = null;
  private rapidPollTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private isRapidPolling: boolean = false;
  private previousShadow: ParsedShadow | null = null;
  private wasAvailable: boolean = true;
  private triggerCards: Record<string, any> = {};
  /** Last successful cloud shadow fetch (ms). Widget uses this to avoid 15‑min stale UI. */
  private lastPollAt: number = 0;
  /** Last cloud fetch attempt (ms), success or fail — stops error storms. */
  private lastAttemptAt: number = 0;
  private pollInFlight: Promise<void> | null = null;
  /**
   * Widget-visible shadow refresh (healthy). Rapid poll after Homey/widget
   * commands stays 5 s × 30 s.
   *
   * No published M-Spa rate limit is known (client only spaces calls by
   * 0.4 s and backs off on HTTP 429). Chosen 30 s while the dashboard is
   * actually on screen: ~120 fetches/hour, ~2 880/day if left open 24 h
   * (idle baseline 4/hour, 96/day). Pool-side button presses lag up to 30 s;
   * Homey/widget commands are unchanged. Failures back off
   * (30 → 60 → 120 s, cap 2 min); after 3 failures widget refresh stops and
   * the 15 min idle poll remains — recovery can take up to 15 min, same as
   * today, by choice (PR #16).
   */
  static readonly WIDGET_SHADOW_MAX_AGE_MS = 30_000;
  static readonly WIDGET_FAIL_BACKOFF_CAP_MS = 120_000;

  constructor(...args: any[]) {
    super(...args);
  }

  async onInit() {
    this.log('M-Spa device initializing...');

    // Cache trigger cards
    this.triggerCards.temperature_changed = this.homey.flow.getDeviceTriggerCard('temperature_changed');
    this.triggerCards.fault_detected = this.homey.flow.getDeviceTriggerCard('fault_detected');
    this.triggerCards.device_online = this.homey.flow.getDeviceTriggerCard('device_online');
    this.triggerCards.device_offline = this.homey.flow.getDeviceTriggerCard('device_offline');

    // Read stored non-sensitive data
    const { product_id, product_series, product_model } = this.getStore();

    // Apply product profile: remove unsupported, re-add supported if missing
    // (re-add fixes devices that lost mspa_ozone after wrong profile / old app)
    await this.applyProfileCapabilities(product_series, product_model);

    // Initial sync
    await this.performPoll();

    // Listeners only for capabilities that exist (avoids invalid_capability)
    this.registerCapabilityListener('target_temperature', this.handleTargetTemperature.bind(this));
    this.registerCapabilityListener('mspa_heater', this.handleHeater.bind(this));
    this.registerCapabilityListener('mspa_filter', this.handleFilter.bind(this));
    if (this.hasCapability('bubble_level')) {
      this.registerCapabilityListener('bubble_level', this.handleBubbleLevel.bind(this));
    }
    if (this.hasCapability('mspa_jets')) {
      this.registerCapabilityListener('mspa_jets', this.handleJets.bind(this));
    }
    if (this.hasCapability('mspa_ozone')) {
      this.registerCapabilityListener('mspa_ozone', this.handleOzone.bind(this));
    }
    if (this.hasCapability('mspa_uvc')) {
      this.registerCapabilityListener('mspa_uvc', this.handleUvc.bind(this));
    }

    this.log('Capability listeners registered');

    // Start idle polling (15-minute interval)
    this.startIdlePolling();

    this.log('M-Spa device initialized');
  }

  /**
   * Helper to get the centralized API client from the app instance
   */
  private getApiClient(): MspaApiClient | null {
    return (this.homey.app as MspaApp).getApiClient();
  }

  /**
   * Sync optional capabilities with product profile (add missing, remove unsupported).
   */
  async applyProfileCapabilities(
    productSeries?: string,
    productModel?: string,
  ): Promise<void> {
    const store = this.getStore();
    const series = productSeries ?? store.product_series ?? '';
    const model = productModel ?? store.product_model ?? '';
    const profile = getProfile(series, model);
    this.log(
      `Applying profile: ${profile.name} (Series: ${series}, Model: ${model})`,
    );

    const optional: Array<{
      cap: string;
      supported: boolean;
    }> = [
      { cap: 'mspa_jets', supported: profile.hasJets },
      { cap: 'mspa_ozone', supported: profile.hasOzone },
      { cap: 'mspa_uvc', supported: profile.hasUvc },
      { cap: 'bubble_level', supported: profile.hasBubbles },
    ];

    // Unknown model (Standard): never strip optional caps — only add missing.
    // Known series (Comfort/Delight/…): may remove features the model lacks.
    const allowRemove = profile.name !== 'Standard';

    for (const { cap, supported } of optional) {
      if (supported && !this.hasCapability(cap)) {
        this.log(`Adding missing capability: ${cap}`);
        await this.addCapability(cap).catch((err: any) =>
          this.error(`Failed to add ${cap}: ${err.message}`),
        );
      } else if (!supported && this.hasCapability(cap) && allowRemove) {
        this.log(`Removing unsupported capability: ${cap}`);
        await this.removeCapability(cap).catch((err: any) =>
          this.error(`Failed to remove ${cap}: ${err.message}`),
        );
      }
    }
  }

  /**
   * Whether a boolean feature is on (capability value, else last shadow).
   * Used by Flow AND-cards so state stays correct even if the capability
   * was briefly missing or Homey has not mirrored the value yet.
   */
  isBooleanFeatureOn(
    capabilityId: string,
    shadowKey?: keyof ParsedShadow,
  ): boolean {
    if (this.hasCapability(capabilityId)) {
      const v = this.getCapabilityValue(capabilityId);
      if (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') {
        return true;
      }
      if (v === false || v === 0 || v === '0' || v === 'false' || v === 'off') {
        return false;
      }
      // null/undefined: fall through to shadow
    }
    if (shadowKey && this.previousShadow) {
      const sv = this.previousShadow[shadowKey];
      if (typeof sv === 'boolean') return sv;
      if (typeof sv === 'number') return sv > 0;
    }
    return false;
  }

  /**
   * Ensure optional cap exists for Flow THEN/AND.
   * Only force-adds when the model is unknown (Standard profile) — a known
   * profile that denies a feature (e.g. Comfort without ozone) is trusted,
   * since the API would reject commands for hardware that does not exist.
   */
  async ensureOptionalCapability(capabilityId: string): Promise<boolean> {
    if (this.hasCapability(capabilityId)) return true;

    await this.applyProfileCapabilities();
    if (this.hasCapability(capabilityId)) {
      this.registerFeatureListener(capabilityId);
      return true;
    }

    const store = this.getStore();
    const profile = getProfile(store.product_series ?? '', store.product_model ?? '');
    if (profile.name !== 'Standard') {
      this.log(
        `Not force-adding ${capabilityId}: profile ${profile.name} does not support it`,
      );
      return false;
    }

    // Unknown model: force-add so Flow cards still work (profile may be wrong).
    const forceable = ['mspa_ozone', 'mspa_uvc', 'mspa_jets', 'bubble_level'];
    if (forceable.includes(capabilityId)) {
      this.log(
        `Force-adding ${capabilityId} (was missing after profile apply — store series/model may be empty or wrong)`,
      );
      try {
        await this.addCapability(capabilityId);
        this.registerFeatureListener(capabilityId);
      } catch (err: any) {
        this.error(`Force-add ${capabilityId} failed: ${err.message}`);
      }
    }
    return this.hasCapability(capabilityId);
  }

  private registerFeatureListener(capabilityId: string): void {
    try {
      switch (capabilityId) {
        case 'mspa_jets':
          this.registerCapabilityListener('mspa_jets', this.handleJets.bind(this));
          break;
        case 'mspa_ozone':
          this.registerCapabilityListener('mspa_ozone', this.handleOzone.bind(this));
          break;
        case 'mspa_uvc':
          this.registerCapabilityListener('mspa_uvc', this.handleUvc.bind(this));
          break;
        case 'bubble_level':
          this.registerCapabilityListener('bubble_level', this.handleBubbleLevel.bind(this));
          break;
        default:
          break;
      }
    } catch (err: any) {
      this.error(`Failed to register listener for ${capabilityId}: ${err.message}`);
    }
  }

  /**
   * Sync parsed shadow state to Homey capabilities
   */
  async syncFromShadow(shadow: ParsedShadow) {
    this.log(`Syncing shadow: ${JSON.stringify(shadow)}`);

    // Detect changes and fire triggers (if not the first sync)
    if (this.previousShadow) {
      // Temperature changed
      if (shadow.water_temperature !== this.previousShadow.water_temperature) {
        this.log(`Firing temperature_changed trigger: ${shadow.water_temperature}`);
        this.triggerCards.temperature_changed.trigger(this, { temperature: shadow.water_temperature })
          .catch((err: any) => this.error(`Failed to fire temperature_changed trigger: ${err.message}`));
      }

      // Fault detected (only fire if it goes from no fault to fault)
      if (shadow.fault && shadow.fault !== '' && shadow.fault !== this.previousShadow.fault) {
        this.log(`Firing fault_detected trigger: ${shadow.fault}`);
        this.triggerCards.fault_detected.trigger(this, { fault_code: shadow.fault })
          .catch((err: any) => this.error(`Failed to fire fault_detected trigger: ${err.message}`));
      }
    }

    const writes: Promise<void>[] = [];
    const write = (cap: string, value: unknown) => {
      if (this.hasCapability(cap)) {
        writes.push(
          this.setCapabilityValue(cap, value)
            .catch((err: any) => this.error(`Failed to set ${cap}: ${err.message}`))
        );
      }
    };

    write('measure_temperature', shadow.water_temperature);
    write('target_temperature', shadow.temperature_setting);
    // Always boolean (never null/undefined) so hasCapability + Flow stay reliable
    write('mspa_heater', !!shadow.heater_state);
    write('mspa_filter', !!shadow.filter_state);
    write('mspa_jets', !!shadow.jet_state);
    write('mspa_ozone', !!shadow.ozone_state);
    write('mspa_uvc', !!shadow.uvc_state);
    write(
      'heater_active',
      shadow.heat_state != null
        ? isActivelyHeating(shadow.heat_state)
        : !!shadow.heater_state,
    );
    write('filter_active', !!shadow.filter_state);

    if (this.hasCapability('bubble_level')) {
      // Off at the pool often leaves bubble_level > 0 while bubble_state is 0.
      const level = Number(shadow.bubble_level);
      const n = Number.isFinite(level) ? level : 0;
      const bubbleValue = !shadow.bubble_state || n <= 0 ? 'off' : String(n);
      write('bubble_level', bubbleValue);
    }

    await Promise.all(writes);

    // Surface fault as a warning; do not mark the device unavailable so the
    // user can still issue commands (e.g., turn off the heater) to recover.
    if (shadow.fault && shadow.fault !== '') {
      this.log(`Spa fault reported: ${shadow.fault}`);
      if (typeof (this as any).setWarning === 'function') {
        (this as any).setWarning(`Spa reported fault: ${shadow.fault}`)
          .catch((err: any) => this.error(`Failed to set warning: ${err.message}`));
      }
    } else if (typeof (this as any).unsetWarning === 'function') {
      (this as any).unsetWarning()
        .catch((err: any) => this.error(`Failed to clear warning: ${err.message}`));
    }

    // Update previous shadow for next sync
    this.previousShadow = shadow;
  }

  /**
   * Handle target temperature capability change
   */
  async handleTargetTemperature(value: any) {
    this.log(`target_temperature changed to ${value}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    // API uses 2x values
    const apiValue = value * 2;

    try {
      await apiClient.sendCommand(deviceId, product_id, { temperature_setting: apiValue });
      this.log('Temperature command sent');
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send temperature command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle heater capability change
   */
  async handleHeater(value: any) {
    this.log(`heater changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    try {
      await apiClient.sendCommand(deviceId, product_id, { heater_state: value ? 1 : 0 });
      this.log('Heater command sent');
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send heater command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle filter capability change with constraint enforcement
   */
  async handleFilter(value: any) {
    this.log(`filter changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    // D003: Filter constraint - if filter is turned off, turn off heater first.
    // If that command fails, abort before sending filter-off so the spa does
    // not end up in an invalid heater=on/filter=off state.
    if (!value) {
      const heaterValue = this.getCapabilityValue('mspa_heater');
      if (heaterValue) {
        this.log('Filter constraint: turning off heater before filter');
        await apiClient.sendCommand(deviceId, product_id, { heater_state: 0 });
        await this.setCapabilityValue('mspa_heater', false)
          .catch((err: any) => this.error(`Failed to mirror heater off: ${err.message}`));
        this.log('Heater turned off via filter constraint');
      }
    }

    try {
      await apiClient.sendCommand(deviceId, product_id, { filter_state: value ? 1 : 0 });
      this.log('Filter command sent');
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send filter command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle bubble level capability change
   */
  async handleBubbleLevel(value: any) {
    this.log(`bubble_level changed to ${value}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    // Convert enum string to number: 'off' -> 0, '1' -> 1, '2' -> 2, '3' -> 3
    const apiValue = value === 'off' ? 0 : parseInt(value, 10);

    try {
      await apiClient.sendCommand(deviceId, product_id, { bubble_level: apiValue });
      this.log('Bubble level command sent');
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send bubble level command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle jets capability change
   */
  async handleJets(value: any) {
    this.log(`jets changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    try {
      await apiClient.sendCommand(deviceId, product_id, { jet_state: value ? 1 : 0 });
      this.log('Jets command sent');
      if (this.hasCapability('mspa_jets')) {
        await this.setCapabilityValue('mspa_jets', !!value)
          .catch((err: any) => this.error(`Failed to mirror jets: ${err.message}`));
      }
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send jets command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle ozone capability change
   */
  async handleOzone(value: any) {
    this.log(`ozone changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    try {
      await apiClient.sendCommand(deviceId, product_id, { ozone_state: value ? 1 : 0 });
      this.log('Ozone command sent');
      // Optimistic mirror so Flow AND-cards see the new state before next poll
      if (this.hasCapability('mspa_ozone')) {
        await this.setCapabilityValue('mspa_ozone', !!value)
          .catch((err: any) => this.error(`Failed to mirror ozone: ${err.message}`));
      }
      this.startRapidPolling();
    } catch (err: any) {
      this.log(`Failed to send ozone command: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle UVC capability change
   */
  async handleUvc(value: any) {
    this.log(`uvc changed to ${value ? 'ON' : 'OFF'}`);
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      throw new Error('Please configure your M-Spa account in app settings');
    }

    try {
      await apiClient.sendCommand(deviceId, product_id, { uvc_state: value ? 1 : 0 });
      this.log('UVC command sent');
      if (this.hasCapability('mspa_uvc')) {
        await this.setCapabilityValue('mspa_uvc', !!value)
          .catch((err: any) => this.error(`Failed to mirror uvc: ${err.message}`));
      }
      this.startRapidPolling();
    } catch (err: any) {
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
   * Fetch cloud shadow if the last *attempt* is older than the current gap.
   * Healthy widget: [maxAgeMs] (30 s). Failures back off; after 3 failures
   * the widget stops hitting the cloud (idle 15 min poll still runs).
   * Rapid poll after Homey commands uses [performPoll] and is unchanged.
   */
  async refreshIfStale(
    maxAgeMs: number = MspaDevice.WIDGET_SHADOW_MAX_AGE_MS,
  ): Promise<void> {
    if (this.consecutiveFailures >= 3) {
      return;
    }
    const gap = this.widgetRefreshGapMs(maxAgeMs);
    if (this.lastAttemptAt > 0 && Date.now() - this.lastAttemptAt < gap) {
      return;
    }
    return this.performPoll();
  }

  /** Healthy: maxAgeMs. After n failures: maxAge × 2^n, capped. */
  widgetRefreshGapMs(maxAgeMs: number): number {
    if (this.consecutiveFailures <= 0) return maxAgeMs;
    const exp = maxAgeMs * 2 ** this.consecutiveFailures;
    return Math.min(exp, MspaDevice.WIDGET_FAIL_BACKOFF_CAP_MS);
  }

  /**
   * Perform a single poll cycle
   */
  async performPoll() {
    if (this.pollInFlight) {
      return this.pollInFlight;
    }
    this.pollInFlight = this.pollOnce().finally(() => {
      this.pollInFlight = null;
    });
    return this.pollInFlight;
  }

  private async pollOnce() {
    const deviceId = this.getData().id;
    const product_id = this.getStore().product_id;
    const apiClient = this.getApiClient();

    if (!apiClient) {
      this.log('Missing API client (account not configured)');
      this.setUnavailable('Please configure your M-Spa account in app settings.');
      return;
    }

    this.lastAttemptAt = Date.now();

    try {
      const shadow = await apiClient.getThingShadow(deviceId, product_id);
      this.consecutiveFailures = 0;
      this.lastPollAt = Date.now();
      
      if (!this.wasAvailable) {
        this.log('Device recovered, firing device_online trigger');
        this.triggerCards.device_online.trigger(this)
          .catch((err: any) => this.error(`Failed to fire device_online trigger: ${err.message}`));
        this.wasAvailable = true;
        await this.setAvailable();
      }

      await this.syncFromShadow(parseShadow(shadow));
      this.log('Poll successful');
    } catch (err: any) {
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
          .catch((err: any) => this.error(`Failed to fire device_offline trigger: ${err.message}`));
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
