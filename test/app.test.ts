/**
 * App lifecycle tests
 *
 * app.ts owns the single MspaApiClient every device and Flow card shares, and
 * rebuilds it when settings change. It was at 0% coverage — the Homey mock had
 * no App class, so it could not be instantiated in a test at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import MspaApp from '../app.js';
import { MspaApiClient } from '../lib/mspa-api/client.js';

const VALID = { email: 'a@b.c', password: 'secret', region: 'row' };

function makeApp(settings: Record<string, unknown> = {}) {
  const app = new MspaApp() as any;
  app.__seedSettings(settings);
  return app as MspaApp & { __seedSettings: Function; homey: any };
}

describe('MspaApp', () => {
  describe('client construction', () => {
    it('builds a client once every credential is present', async () => {
      const app = makeApp(VALID);
      await app.onInit();
      expect(app.getApiClient()).toBeInstanceOf(MspaApiClient);
    });

    it('has no client before configuration', async () => {
      const app = makeApp();
      await app.onInit();
      expect(app.getApiClient()).toBeNull();
    });

    it.each(['email', 'password', 'region'])(
      'has no client when %s is missing',
      async (missing) => {
        const partial: Record<string, unknown> = { ...VALID };
        delete partial[missing];
        const app = makeApp(partial);
        await app.onInit();
        expect(app.getApiClient()).toBeNull();
      },
    );

    it('has no client when a credential is present but empty', async () => {
      const app = makeApp({ ...VALID, password: '' });
      await app.onInit();
      expect(app.getApiClient()).toBeNull();
    });

    it('fails closed on an unknown region rather than half-configured', async () => {
      const app = makeApp({ ...VALID, region: 'atlantis' });
      await app.onInit();
      expect(app.getApiClient()).toBeNull();
    });
  });

  describe('reacting to settings changes', () => {
    it('builds a client when credentials are completed after start', async () => {
      const app = makeApp();
      await app.onInit();
      expect(app.getApiClient()).toBeNull();

      app.homey.settings.set('email', VALID.email);
      app.homey.settings.set('password', VALID.password);
      app.homey.settings.set('region', VALID.region);

      expect(app.getApiClient()).toBeInstanceOf(MspaApiClient);
    });

    it('replaces the client when credentials change', async () => {
      const app = makeApp(VALID);
      await app.onInit();
      const first = app.getApiClient();

      app.homey.settings.set('email', 'other@example.com');

      expect(app.getApiClient()).toBeInstanceOf(MspaApiClient);
      expect(app.getApiClient()).not.toBe(first);
    });

    it('drops the client when a credential is removed', async () => {
      const app = makeApp(VALID);
      await app.onInit();
      expect(app.getApiClient()).toBeInstanceOf(MspaApiClient);

      app.homey.settings.unset('password');

      expect(app.getApiClient()).toBeNull();
    });

    it('drops the client when the region becomes invalid', async () => {
      const app = makeApp(VALID);
      await app.onInit();

      app.homey.settings.set('region', 'atlantis');

      expect(app.getApiClient()).toBeNull();
    });
  });

  describe('credential handling', () => {
    it('never logs the password value', async () => {
      const app = makeApp(VALID);
      const logged: string[] = [];
      app.log = (...args: unknown[]) => { logged.push(args.join(' ')); };

      await app.onInit();
      app.homey.settings.set('password', 'hunter2');

      const all = logged.join('\n');
      expect(all).not.toContain('hunter2');
      expect(all).not.toContain('secret');
      expect(all).toContain('********');
    });

    it('does not keep the plaintext password on the client', async () => {
      const app = makeApp(VALID);
      await app.onInit();
      // The client hashes at construction; plaintext must not survive on it.
      expect(JSON.stringify(app.getApiClient())).not.toContain('secret');
    });
  });
});
