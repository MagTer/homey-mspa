/**
 * M-Spa Product Profiles
 *
 * Defines which capabilities each MSpa series / model exposes. Sourced from
 * the-mspa.com product pages and vendor spec sheets. Each series entry is
 * the safest assumption for the whole series; specific models that diverge
 * use MODEL_PREFIX_PROFILES (which wins over the series match).
 *
 * Standard capabilities present on every model:
 *   measure_temperature, target_temperature, mspa_heater, mspa_filter,
 *   heater_active, filter_active.
 */

export interface MspaProfile {
  name: string;
  hasJets: boolean;    // hydrotherapy jets (water jets)
  hasOzone: boolean;
  hasUvc: boolean;
  hasBubbles: boolean; // air bubble massage system (bubble_level)
}

export const PROFILES: Record<string, MspaProfile> = {
  // Comfort (C-): budget line, classic styling, air-bubble only.
  // Examples: C-BE062 Bergen, C-TE062 Tekapo, C-ME062 Meteor.
  COMFORT: {
    name: 'Comfort',
    hasJets: false,
    hasOzone: false,
    hasUvc: false,
    hasBubbles: true,
  },
  // Delight (D-): legacy line, air-bubble only.
  DELIGHT: {
    name: 'Delight',
    hasJets: false,
    hasOzone: false,
    hasUvc: false,
    hasBubbles: true,
  },
  // Urban: intelligent series, air bubbles + UVC (some models add ozone).
  URBAN: {
    name: 'Urban',
    hasJets: false,
    hasOzone: true,
    hasUvc: true,
    hasBubbles: true,
  },
  // Premium (P-): leather-styled covers, air bubbles + ozone.
  PREMIUM: {
    name: 'Premium',
    hasJets: false,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Elite: dual-system line — air bubbles + adjustable hydrojets + ozone.
  // Example: Rêve has 118 air jets and 4 hydromassage jets.
  ELITE: {
    name: 'Elite',
    hasJets: true,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Muse (M-): luxury dual-system — air bubbles + hydrojets + ozone.
  // Example: Carlton M-CA041 has 118 air jets and 4 adjustable hydrojets.
  MUSE: {
    name: 'Muse',
    hasJets: true,
    hasOzone: true,
    hasUvc: false,
    hasBubbles: true,
  },
  // Frame (F-): rigid drop-stitch walls, air bubbles + UVC + ozone, NO
  // hydrotherapy jets. Verified against F-TU (Tuscany), F-MO (Mono),
  // F-DU (Duet), F-OS (Oslo), F-TR (Tribeca) product pages.
  FRAME: {
    name: 'Frame',
    hasJets: false,
    hasOzone: true,
    hasUvc: true,
    hasBubbles: true,
  },
  // Verto: newer series (Cocoon, Tidal). Treat like Frame pending specs.
  VERTO: {
    name: 'Verto',
    hasJets: false,
    hasOzone: true,
    hasUvc: true,
    hasBubbles: true,
  },
};

/**
 * Model-code prefix overrides. Matched before series names so a specific
 * product can opt out of the broader series default.
 *
 * Model codes follow {series-letter}-{model}{size}{variant}, e.g.
 * F-TU062W = Frame, Tuscany, 6-person, v2, WiFi.
 */
export const MODEL_PREFIX_PROFILES: Array<[string, MspaProfile]> = [
  // Frame Tuscany — matches the Frame default today, kept explicit so the
  // lookup chain is traceable for the most-sold Frame SKU.
  ['F-TU', {
    name: 'Tuscany',
    hasJets: false,
    hasOzone: true,
    hasUvc: true,
    hasBubbles: true,
  }],
];

/** Default when nothing matches — bubble-only (the universal subset). */
export const DEFAULT_PROFILE: MspaProfile = {
  name: 'Standard',
  hasJets: false,
  hasOzone: false,
  hasUvc: false,
  hasBubbles: true,
};

/**
 * Resolve a profile in priority order:
 *   1. product_model prefix (most specific)
 *   2. product_series substring
 *   3. product_model substring (catches codes like "FRAME-X")
 *   4. default
 */
export function getProfile(productSeries: string = '', productModel: string = ''): MspaProfile {
  const modelUpper = productModel.toUpperCase();
  const seriesUpper = productSeries.toUpperCase();

  for (const [prefix, profile] of MODEL_PREFIX_PROFILES) {
    if (modelUpper.startsWith(prefix)) {
      return profile;
    }
  }

  for (const [key, profile] of Object.entries(PROFILES)) {
    if (seriesUpper.includes(key) || modelUpper.includes(key)) {
      return profile;
    }
  }

  return DEFAULT_PROFILE;
}
