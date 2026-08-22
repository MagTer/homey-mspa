import { describe, it, expect } from 'vitest';
import { getProfile, DEFAULT_PROFILE } from '../../lib/mspa-api/profiles.js';

describe('getProfile', () => {
  it('F-TU062W Tuscany: bubbles + UVC + ozone, no hydrojets', () => {
    const p = getProfile('Frame', 'F-TU062W');
    expect(p.name).toBe('Tuscany');
    expect(p.hasJets).toBe(false);
    expect(p.hasBubbles).toBe(true);
    expect(p.hasOzone).toBe(true);
    expect(p.hasUvc).toBe(true);
  });

  it('is case-insensitive on model code', () => {
    expect(getProfile('', 'f-tu062w').name).toBe('Tuscany');
  });

  it('Frame series defaults to bubbles + UVC + ozone (no hydrojets)', () => {
    const p = getProfile('Frame', 'F-XY01W');
    expect(p.name).toBe('Frame');
    expect(p.hasJets).toBe(false);
    expect(p.hasBubbles).toBe(true);
    expect(p.hasUvc).toBe(true);
    expect(p.hasOzone).toBe(true);
  });

  it('Muse series has hydrojets + bubbles + ozone', () => {
    const p = getProfile('Muse', 'M-CA041');
    expect(p.name).toBe('Muse');
    expect(p.hasJets).toBe(true);
    expect(p.hasBubbles).toBe(true);
    expect(p.hasOzone).toBe(true);
  });

  it('Elite series has hydrojets + bubbles + ozone', () => {
    const p = getProfile('Elite', '');
    expect(p.name).toBe('Elite');
    expect(p.hasJets).toBe(true);
    expect(p.hasOzone).toBe(true);
  });

  it('Comfort series is bubbles-only', () => {
    const p = getProfile('Comfort', 'C-BE062');
    expect(p.name).toBe('Comfort');
    expect(p.hasBubbles).toBe(true);
    expect(p.hasJets).toBe(false);
    expect(p.hasOzone).toBe(false);
    expect(p.hasUvc).toBe(false);
  });

  it('Delight series is bubbles-only', () => {
    const p = getProfile('Delight', 'D-01');
    expect(p.name).toBe('Delight');
    expect(p.hasBubbles).toBe(true);
    expect(p.hasJets).toBe(false);
    expect(p.hasOzone).toBe(false);
    expect(p.hasUvc).toBe(false);
  });

  it('Premium series has bubbles + ozone', () => {
    const p = getProfile('Premium', 'P-SH069');
    expect(p.name).toBe('Premium');
    expect(p.hasBubbles).toBe(true);
    expect(p.hasOzone).toBe(true);
    expect(p.hasJets).toBe(false);
  });

  it('Urban series has bubbles + UVC + ozone', () => {
    const p = getProfile('Urban', '');
    expect(p.name).toBe('Urban');
    expect(p.hasUvc).toBe(true);
    expect(p.hasBubbles).toBe(true);
  });

  it('falls back to default profile for unknown series and model', () => {
    expect(getProfile('Unknown', 'X-00')).toEqual(DEFAULT_PROFILE);
  });
});

describe('model-code series letter fallback', () => {
  // Reached only when neither a model-prefix override nor the series/model
  // substring matched. Guards issue #10: a model the table covers, resolved as
  // unknown because product_series did not contain the literal series name.
  const byCodeAlone = (model: string) => getProfile('', model);

  it('resolves every documented series letter from the code alone', () => {
    expect(byCodeAlone('C-BE062').name).toBe('Comfort');
    expect(byCodeAlone('D-AL062').name).toBe('Delight');
    expect(byCodeAlone('P-SE062').name).toBe('Premium');
    expect(byCodeAlone('M-CA041').name).toBe('Muse');
    expect(byCodeAlone('F-OS062').name).toBe('Frame');
  });

  it('resolves the Oslo to Frame without a series string', () => {
    // issue #10. Frame has no hydrojets, so the phantom jets control goes away.
    const oslo = byCodeAlone('F-OS062');
    expect(oslo.name).toBe('Frame');
    expect(oslo.hasJets).toBe(false);
    expect(oslo.hasOzone).toBe(true);
    expect(oslo.hasUvc).toBe(true);
    expect(oslo.hasBubbles).toBe(true);
  });

  it('handles the whole documented Frame line', () => {
    for (const model of ['F-MO061', 'F-DU062', 'F-OS062', 'F-TR062']) {
      expect(byCodeAlone(model).name).toBe('Frame');
    }
    // Tuscany keeps its explicit override, which wins before this fallback.
    expect(byCodeAlone('F-TU062W').name).toBe('Tuscany');
  });

  it('accepts the trailing variant letter', () => {
    expect(byCodeAlone('F-OS062W').name).toBe('Frame');
    expect(byCodeAlone('C-BE062W').name).toBe('Comfort');
  });

  it('leaves undocumented series letters alone', () => {
    // Urban, Elite and Verto have no documented letter. Guessing one would
    // strip capabilities from the wrong hardware.
    expect(byCodeAlone('U-DR062').name).toBe('Standard');
    expect(byCodeAlone('E-RE061').name).toBe('Standard');
    expect(byCodeAlone('V-CO061').name).toBe('Standard');
  });

  it('requires a real model-code shape, not just a leading letter', () => {
    for (const junk of ['F', 'F-', 'F-X', 'F-XX', 'F-1234', 'FOO', 'F_OS062', 'XF-OS062']) {
      expect(byCodeAlone(junk).name).toBe('Standard');
    }
  });

  it('never overrides a resolution that already worked', () => {
    // Series string wins; the fallback only rescues what would have been unknown.
    expect(getProfile('Elite', 'F-OS062').name).toBe('Elite');
    expect(getProfile('Muse', 'C-BE062').name).toBe('Muse');
    expect(getProfile('Frame', 'F-OS062').name).toBe('Frame');
  });

  it('still falls back to Standard with nothing to go on', () => {
    expect(getProfile('', '').name).toBe('Standard');
    expect(getProfile('Nonsense', 'Nonsense').name).toBe('Standard');
  });
});
