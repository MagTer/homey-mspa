/**
 * Manifest route tests
 *
 * Homey only serves an api.js handler that the manifest declares under `api`.
 * The settings page shipped calling POST /validate-credentials for months with
 * no route declared: Homey answered "Cannot POST", nobody could save
 * credentials, and every test still passed because they call api.js directly
 * (issue #24). These tests tie each frontend call to a declared route and each
 * declared route to a handler that exists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import appApi from '../api.js';
import widgetApi from '../widgets/mspa-panel/api.js';

type Route = { method: string; path: string };

const root = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));

// Matches homey.api('POST', '/path' ...) and Homey.api('GET', '/path?x=' ...);
// the query string is not part of the route.
function frontendCalls(file: string): Route[] {
  const source = readFileSync(resolve(root, file), 'utf8');
  const calls = [...source.matchAll(/[hH]omey\.api\(\s*'([A-Z]+)'\s*,\s*'([^'?]+)/g)]
    .map(([, method, path]) => ({ method, path }));
  // Guard against the regex silently matching nothing.
  expect(calls.length).toBeGreaterThan(0);
  return calls;
}

const surfaces = [
  {
    name: 'app settings page',
    routes: manifest.api as Record<string, Route> | undefined,
    handlers: appApi as Record<string, unknown>,
    frontend: 'settings/index.html',
  },
  {
    name: 'mspa-panel widget',
    routes: manifest.widgets?.['mspa-panel']?.api as Record<string, Route> | undefined,
    handlers: widgetApi as Record<string, unknown>,
    frontend: 'widgets/mspa-panel/public/index.html',
  },
];

describe.each(surfaces)('$name routes', ({ routes, handlers, frontend }) => {
  it('declares an api block in app.json', () => {
    expect(routes).toBeDefined();
  });

  it('declares a route for every call the frontend makes', () => {
    const declared = Object.values(routes ?? {}).map((r) => `${r.method} ${r.path}`);
    for (const call of frontendCalls(frontend)) {
      expect(declared).toContain(`${call.method} ${call.path}`);
    }
  });

  it('declares only routes whose handler exists, and every handler has a route', () => {
    expect(Object.keys(routes ?? {}).sort()).toEqual(
      Object.keys(handlers).filter((k) => typeof handlers[k] === 'function').sort(),
    );
  });
});
