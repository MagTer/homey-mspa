/**
 * Shadow data parser for M-Spa API client
 * Converts raw API responses to normalized types
 */

import { RawShadowData, ParsedShadow } from './types.js';

/**
 * Parse raw shadow data into normalized types
 * @param raw Raw shadow data from the API
 * @returns Parsed shadow data with correct types
 */
/** API often uses 0/1; accept truthy numbers/bools so state is not stuck “off”. */
function asOn(v: unknown): boolean {
  if (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') return true;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true;
  return false;
}

export function parseShadow(raw: RawShadowData): ParsedShadow {
  return {
    water_temperature: raw.water_temperature / 2, // Divide by 2 to get Celsius
    temperature_setting: raw.temperature_setting / 2, // Divide by 2 to get Celsius
    heater_state: asOn(raw.heater_state),
    filter_state: asOn(raw.filter_state),
    bubble_state: asOn(raw.bubble_state),
    bubble_level: raw.bubble_level, // 0-3, pass as-is
    uvc_state: asOn(raw.uvc_state),
    ozone_state: asOn(raw.ozone_state),
    jet_state: asOn(raw.jet_state),
    fault: raw.fault, // Pass as string
  };
}
