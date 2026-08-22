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

/**
 * Series letter prefixes, taken from the model-code scheme documented above.
 *
 * Consulted only after both the model-prefix overrides and the series/model
 * substring match have failed, so this can never change a resolution that
 * already worked — it only rescues codes that would otherwise fall through to
 * the unknown `Standard` profile. The substring match needs the API to return
 * a `product_series` containing the literal series name; nothing in this
 * repository records that it always does, and issue #10 (Oslo) is what a miss
 * looks like: a model the table covers, resolved as unknown, keeping a jets
 * control the hardware does not have.
 *
 * Only letters that the series comments above state explicitly are listed.
 * Urban, Elite and Verto have no documented letter, so they are deliberately
 * absent — guessing one would strip capabilities from the wrong hardware, and
 * capability removal is destructive.
 */
export const SERIES_PREFIX_PROFILES: Array<[string, keyof typeof PROFILES]> = [
  ['C', 'COMFORT'],
  ['D', 'DELIGHT'],
  ['P', 'PREMIUM'],
  ['M', 'MUSE'],
  ['F', 'FRAME'],
];

/**
 * Shape of an M-Spa model code: series letter, dash, two model letters, then
 * the size digits — C-BE062, F-OS062, M-CA041, F-TU062W.
 *
 * Deliberately strict. A loose `startsWith('F-')` would match any string the
 * cloud happens to send, and a wrong match here removes capabilities.
 */
const MODEL_CODE = /^([A-Z])-[A-Z]{2}\d{2}/;

/**
 * Default when series/model is unknown or empty.
 * Prefer **keeping** ozone/UVC so Flow cards work; Comfort/Delight still strip
 * them when the series is explicitly recognized without those features.
 * (Previously bubble-only DEFAULT removed mspa_ozone → invalid_capability forever.)
 */
export const DEFAULT_PROFILE: MspaProfile = {
  name: 'Standard',
  hasJets: false,
  hasOzone: true,
  hasUvc: true,
  hasBubbles: true,
};

/**
 * Resolve a profile in priority order:
 *   1. product_model prefix (most specific)
 *   2. product_series substring
 *   3. product_model substring (catches codes like "FRAME-X")
 *   4. model-code series letter (C-BE062 -> Comfort)
 *   5. default
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

  const code = MODEL_CODE.exec(modelUpper);
  if (code) {
    const match = SERIES_PREFIX_PROFILES.find(([letter]) => letter === code[1]);
    if (match) {
      return PROFILES[match[1]];
    }
  }

  return DEFAULT_PROFILE;
}
