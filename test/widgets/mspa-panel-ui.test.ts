/**
 * Dashboard widget frontend tests
 *
 * The ~317 lines of JavaScript inlined in public/index.html were outside both
 * the typecheck and the test suite. That included the document.hidden gating
 * shipped in v1.0.7, which limits how often an open dashboard hits the M-Spa
 * cloud — the app's largest single source of API traffic.
 *
 * Rather than restructure how the widget loads (which cannot be verified
 * without a real Homey), these tests load index.html into jsdom and execute the
 * page's own script. Nothing about what ships changes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(
  new URL('../../widgets/mspa-panel/public/index.html', import.meta.url),
  'utf8',
);

let dom: JSDOM;
let win: any;

function load({ language = 'en-GB', hidden = false } = {}) {
  dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
  win = dom.window as any;
  Object.defineProperty(win.navigator, 'language', { value: language, configurable: true });
  Object.defineProperty(win.document, 'hidden', {
    value: hidden, configurable: true, writable: true,
  });
  return win;
}

/**
 * Controls the *page's* timers. vitest fake timers patch globalThis, not the
 * jsdom window the widget script actually calls, so an interval assertion
 * against vi.advanceTimersByTime silently measures nothing.
 */
function installTimerControl(w: any) {
  const intervals = new Map<number, { fn: Function; every: number }>();
  let nextId = 1;
  w.setInterval = (fn: Function, every: number) => {
    const id = nextId++;
    intervals.set(id, { fn, every });
    return id;
  };
  w.clearInterval = (id: number) => { intervals.delete(id); };
  return {
    live: () => intervals.size,
    tick(ms: number) {
      for (const { fn, every } of [...intervals.values()]) {
        for (let i = 0; i < Math.floor(ms / every); i++) fn();
      }
    },
  };
}

function setHidden(value: boolean) {
  Object.defineProperty(win.document, 'hidden', {
    value, configurable: true, writable: true,
  });
  win.document.dispatchEvent(new win.Event('visibilitychange'));
}

/** A Homey stub whose api() resolves with a minimal status payload. */
function fakeHomey(overrides: Record<string, unknown> = {}) {
  return {
    ready: vi.fn(),
    api: vi.fn().mockResolvedValue({
      dataId: 'd1', name: 'Spa', available: true,
      measure_temperature: 38, target_temperature: 40,
      mspa_heater: true, mspa_filter: false,
      heater_active: true, filter_active: false,
      features: { jets: true, ozone: false, uvc: false, bubbles: false },
      ...overrides,
    }),
    hapticFeedback: vi.fn(),
  };
}

afterEach(() => {
  try { win?.stopSyncLoop?.(); } catch { /* page may not have loaded */ }
  dom?.window?.close();
});

describe('widget label packs', () => {
  beforeEach(() => load());

  it('every language pack defines the same keys', () => {
    // `const` at the top level of a classic script is not a window property.
    const packs = win.eval('LABELS');
    const en = Object.keys(packs.en).sort();
    for (const code of Object.keys(packs)) {
      expect({ code, keys: Object.keys(packs[code]).sort() }).toEqual({ code, keys: en });
    }
  });

  it('picks the language from the browser locale', () => {
    expect(win.lang()).toBe('en');
    load({ language: 'de-DE' }); expect(win.lang()).toBe('de');
    load({ language: 'sv-SE' }); expect(win.lang()).toBe('sv');
    load({ language: 'nb-NO' }); expect(win.lang()).toBe('no');
    load({ language: 'fr-FR' }); expect(win.lang()).toBe('en');
  });

  it('falls back to English, not German, when the selected pack is missing', () => {
    // Unreachable in practice — lang() only returns codes that have a pack, and
    // the parity test above keeps every pack complete. It is still the wrong
    // default to leave in place: this used to fall back to LABELS.de, so any
    // future gap would have surfaced German to everyone. Forcing lang() to an
    // unknown code is the only way to exercise the branch.
    win.lang = () => 'xx';
    const packs = win.eval('LABELS');
    for (const key of Object.keys(packs.en)) {
      expect(win.t(key)).toBe(packs.en[key]);
    }
  });

  it('returns the key itself when no pack defines it', () => {
    expect(win.t('definitely_not_a_key')).toBe('definitely_not_a_key');
  });
});

describe('fmtTemp', () => {
  beforeEach(() => load());

  it('renders one decimal place', () => {
    expect(win.fmtTemp(38)).toBe('38.0');
    expect(win.fmtTemp(38.25)).toBe('38.3');
  });

  it('renders a placeholder for missing or non-numeric values', () => {
    for (const v of [null, undefined, 'abc', NaN]) {
      expect(win.fmtTemp(v)).toBe('--.-');
    }
  });
});

describe('sync loop visibility gating (v1.0.7)', () => {
  let homey: ReturnType<typeof fakeHomey>;
  let timers: ReturnType<typeof installTimerControl>;

  beforeEach(async () => {
    load();
    timers = installTimerControl(win);
    homey = fakeHomey();
    (homey as any).getDeviceIds = () => ['d1'];
    // Go through the real entry point so the visibilitychange listener is
    // registered exactly as it is on a live dashboard.
    win.onHomeyReady(homey);
    await Promise.resolve();
    await Promise.resolve();
    homey.api.mockClear();
  });

  it('polls on an interval while the page is visible', () => {
    expect(timers.live()).toBe(1);
    timers.tick(5000);
    expect(homey.api).toHaveBeenCalledTimes(1);
    timers.tick(10000);
    expect(homey.api).toHaveBeenCalledTimes(3);
  });

  it('does not start polling when the page is already hidden', () => {
    win.stopSyncLoop();
    setHidden(true);
    win.startSyncLoop(homey);
    expect(timers.live()).toBe(0);
    timers.tick(30000);
    expect(homey.api).not.toHaveBeenCalled();
  });

  it('clears the interval when the page is hidden', () => {
    expect(timers.live()).toBe(1);
    setHidden(true);
    expect(timers.live()).toBe(0);
    timers.tick(60000);
    expect(homey.api).not.toHaveBeenCalled();
  });

  it('fetches once immediately when the page becomes visible again', () => {
    setHidden(true);
    homey.api.mockClear();

    setHidden(false);
    expect(homey.api).toHaveBeenCalledTimes(1); // not waiting out the interval
    timers.tick(5000);
    expect(homey.api).toHaveBeenCalledTimes(2);
  });

  it('never stacks intervals, however often visibility flips', () => {
    // A leaked interval would multiply cloud traffic for every viewer.
    for (let i = 0; i < 5; i++) { setHidden(true); setHidden(false); }
    expect(timers.live()).toBe(1);

    homey.api.mockClear();
    timers.tick(5000);
    expect(homey.api).toHaveBeenCalledTimes(1);
  });

  it('replaces rather than stacks when started again without an intervening hide', () => {
    // startSyncLoop clears first. Without that, a second call while already
    // running leaks the previous interval and doubles cloud traffic.
    win.startSyncLoop(homey);
    win.startSyncLoop(homey);
    expect(timers.live()).toBe(1);

    homey.api.mockClear();
    timers.tick(5000);
    expect(homey.api).toHaveBeenCalledTimes(1);
  });

  it('stopSyncLoop is safe to call repeatedly', () => {
    expect(() => { win.stopSyncLoop(); win.stopSyncLoop(); }).not.toThrow();
    expect(timers.live()).toBe(0);
  });
});

describe('render', () => {
  beforeEach(() => load());

  it('shows the measured and target temperature', () => {
    win.render({
      available: true, measure_temperature: 38.2, target_temperature: 40,
      features: {},
    });
    expect(win.document.body.textContent).toContain('38.2');
    expect(win.document.body.textContent).toContain('40.0');
  });

  it('marks the heater key on when the heater is on', () => {
    win.render({ available: true, mspa_heater: true, features: {} });
    expect(win.document.getElementById('key-heater').className).toContain('on');
  });

  it('paints the heater key red only while actually heating', () => {
    win.render({ available: true, mspa_heater: true, heater_active: true, features: {} });
    expect(win.document.getElementById('key-heater').className).toContain('heating');

    win.render({ available: true, mspa_heater: true, heater_active: false, features: {} });
    expect(win.document.getElementById('key-heater').className).not.toContain('heating');
  });

  it('reports when no device is selected', () => {
    win.render({ error: 'no_device' });
    expect(win.document.getElementById('msg').textContent).toBeTruthy();
  });
});
