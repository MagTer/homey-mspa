/**
 * Shadow parsing tests for M-Spa API client
 * Tests the parseShadow function for correct type conversion
 */

import { describe, it, expect } from 'vitest';
import { isActivelyHeating, parseShadow } from '../../lib/mspa-api/shadow.js';

describe('parseShadow', () => {
  it('should correctly parse standard shadow values', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 1,
      filter_state: 0,
      bubble_state: 1,
      bubble_level: 2,
      uvc_state: 0,
      ozone_state: 1,
      jet_state: 0,
      fault: '',
    };

    const parsed = parseShadow(raw);

    expect(parsed.water_temperature).toBe(38); // 76 / 2
    expect(parsed.temperature_setting).toBe(40); // 80 / 2
    expect(parsed.heater_state).toBe(true);
    expect(parsed.filter_state).toBe(false);
    expect(parsed.bubble_state).toBe(true);
    expect(parsed.bubble_level).toBe(2);
    expect(parsed.uvc_state).toBe(false);
    expect(parsed.ozone_state).toBe(true);
    expect(parsed.jet_state).toBe(false);
    expect(parsed.fault).toBe('');
  });

  it('should correctly parse temperature 0 (should be 0°C)', () => {
    const raw = {
      water_temperature: 0,
      temperature_setting: 0,
      heater_state: 0,
      filter_state: 0,
      bubble_state: 0,
      bubble_level: 0,
      uvc_state: 0,
      ozone_state: 0,
      jet_state: 0,
      fault: '',
    };

    const parsed = parseShadow(raw);

    expect(parsed.water_temperature).toBe(0);
    expect(parsed.temperature_setting).toBe(0);
  });

  it('should correctly parse odd temperature values', () => {
    const raw = {
      water_temperature: 77, // 77 / 2 = 38.5
      temperature_setting: 79, // 79 / 2 = 39.5
      heater_state: 1,
      filter_state: 0,
      bubble_state: 1,
      bubble_level: 3,
      uvc_state: 1,
      ozone_state: 1,
      jet_state: 1,
      fault: '',
    };

    const parsed = parseShadow(raw);

    expect(parsed.water_temperature).toBe(38.5);
    expect(parsed.temperature_setting).toBe(39.5);
  });

  it('should correctly map bubble_level values 0-3', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 1,
      filter_state: 0,
      bubble_state: 1,
      bubble_level: 0,
      uvc_state: 0,
      ozone_state: 0,
      jet_state: 0,
      fault: '',
    };

    let parsed = parseShadow(raw);
    expect(parsed.bubble_level).toBe(0);

    raw.bubble_level = 3;
    parsed = parseShadow(raw);
    expect(parsed.bubble_level).toBe(3);
  });

  it('should correctly parse empty fault string', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 1,
      filter_state: 0,
      bubble_state: 1,
      bubble_level: 2,
      uvc_state: 0,
      ozone_state: 1,
      jet_state: 0,
      fault: '',
    };

    const parsed = parseShadow(raw);
    expect(parsed.fault).toBe('');
  });

  it('should correctly parse fault string with value', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 1,
      filter_state: 0,
      bubble_state: 1,
      bubble_level: 2,
      uvc_state: 0,
      ozone_state: 1,
      jet_state: 0,
      fault: 'E1',
    };

    const parsed = parseShadow(raw);
    expect(parsed.fault).toBe('E1');
  });

  it('should correctly parse boolean state fields', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 0,
      filter_state: 1,
      bubble_state: 0,
      bubble_level: 0,
      uvc_state: 1,
      ozone_state: 0,
      jet_state: 1,
      fault: '',
    };

    const parsed = parseShadow(raw);

    expect(parsed.heater_state).toBe(false);
    expect(parsed.filter_state).toBe(true);
    expect(parsed.bubble_state).toBe(false);
    expect(parsed.uvc_state).toBe(true);
    expect(parsed.ozone_state).toBe(false);
    expect(parsed.jet_state).toBe(true);
  });

  it('should parse heat_state and detect active heating', () => {
    const raw = {
      water_temperature: 76,
      temperature_setting: 80,
      heater_state: 1,
      heat_state: 3,
      filter_state: 1,
      bubble_state: 0,
      bubble_level: 0,
      uvc_state: 0,
      ozone_state: 0,
      jet_state: 0,
      fault: '',
    };

    expect(parseShadow(raw).heat_state).toBe(3);
    expect(isActivelyHeating(3)).toBe(true);
    expect(isActivelyHeating(2)).toBe(true);
    expect(isActivelyHeating(4)).toBe(false);
    expect(isActivelyHeating(0)).toBe(false);
    expect(isActivelyHeating(null)).toBe(false);
  });
});
