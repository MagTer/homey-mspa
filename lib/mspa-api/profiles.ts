/**
 * M-Spa Product Profiles
 * Defines supported capabilities for different spa models based on product series.
 */

export interface MspaProfile {
  name: string;
  hasJets: boolean;
  hasOzone: boolean;
  hasUvc: boolean;
  hasBubbles: boolean;
}

/**
 * Standard capabilities always present in all models:
 * - measure_temperature
 * - target_temperature
 * - mspa_heater
 * - mspa_filter
 * - heater_active (sensor)
 * - filter_active (sensor)
 */

export const PROFILES: Record<string, MspaProfile> = {
  // Delight Series: Basic features, Bubbles only
  DELIGHT: {
    name: 'Delight',
    hasJets: false,
    hasOzone: false,
    hasUvc: false,
    hasBubbles: true,
  },
  // Premium Series: Bubbles + Ozone
  PREMIUM: {
    name: 'Premium',
    hasJets: false,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Elite Series: Bubbles + Ozone
  ELITE: {
    name: 'Elite',
    hasJets: false,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Muse Series: Bubbles + Jets + Ozone
  MUSE: {
    name: 'Muse',
    hasJets: true,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Frame Series: All features
  FRAME: {
    name: 'Frame',
    hasJets: true,
    hasOzone: true,
    hasUvc: true,
    hasBubbles: true,
  },
  // Urban Series: Bubbles + Ozone?
  URBAN: {
    name: 'Urban',
    hasJets: false,
    hasOzone: true,
    hasUvc: true, // Some urban models have UVC
    hasBubbles: true,
  },
};

/** Default profile for unknown models (safest subset) */
export const DEFAULT_PROFILE: MspaProfile = {
  name: 'Standard',
  hasJets: false,
  hasOzone: false,
  hasUvc: false,
  hasBubbles: true,
};

/**
 * Get the product profile based on product_series or product_model
 */
export function getProfile(productSeries: string = '', productModel: string = ''): MspaProfile {
  const seriesUpper = productSeries.toUpperCase();
  const modelUpper = productModel.toUpperCase();

  for (const [key, profile] of Object.entries(PROFILES)) {
    if (seriesUpper.includes(key) || modelUpper.includes(key)) {
      return profile;
    }
  }

  return DEFAULT_PROFILE;
}
