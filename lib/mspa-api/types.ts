/**
 * Type definitions for M-Spa API client
 */

/** Region codes for the M-Spa API */
export type MspaRegion = 'row' | 'us' | 'ch';

/** Configuration for the M-Spa API client */
export interface MspaClientConfig {
  email: string;
  password?: string;
  region: MspaRegion;
  passwordHash?: string;
}

/** Device information returned from the API */
export interface DeviceInfo {
  device_id: string;
  product_id: string;
  product_series: string;
  product_model: string;
  software_version: string;
  wifi_version: string;
  mcu_version: string;
  device_alias: string;
}

/** Raw shadow data as received from the API */
export interface RawShadowData {
  water_temperature: number;
  temperature_setting: number;
  heater_state: number;
  filter_state: number;
  bubble_state: number;
  bubble_level: number;
  uvc_state: number;
  ozone_state: number;
  jet_state: number;
  fault: string;
}

/** Parsed shadow data with normalized types */
export interface ParsedShadow {
  water_temperature: number; // Celsius
  temperature_setting: number; // Celsius
  heater_state: boolean;
  filter_state: boolean;
  bubble_state: boolean;
  bubble_level: number; // 0-3
  uvc_state: boolean;
  ozone_state: boolean;
  jet_state: boolean;
  fault: string;
}

/** Generic API response structure */
export interface ApiResponse<T> {
  data: T;
  code?: number;
  message?: string;
}
