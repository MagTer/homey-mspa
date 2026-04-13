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
export function parseShadow(raw: RawShadowData): ParsedShadow {
  return {
    water_temperature: raw.water_temperature / 2, // Divide by 2 to get Celsius
    temperature_setting: raw.temperature_setting / 2, // Divide by 2 to get Celsius
    heater_state: raw.heater_state === 1,
    filter_state: raw.filter_state === 1,
    bubble_state: raw.bubble_state === 1,
    bubble_level: raw.bubble_level, // 0-3, pass as-is
    uvc_state: raw.uvc_state === 1,
    ozone_state: raw.ozone_state === 1,
    jet_state: raw.jet_state === 1,
    fault: raw.fault, // Pass as string
  };
}
