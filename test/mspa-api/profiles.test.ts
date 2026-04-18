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
