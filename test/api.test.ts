/**
 * Settings-page endpoint tests
 *
 * api.js verifies M-Spa credentials before they are saved. It was neither
 * typechecked nor tested, despite being the path the user's password travels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authenticate = vi.fn();
vi.mock('../lib/mspa-api/client.ts', () => ({
  MspaApiClient: vi.fn().mockImplementation((config: any) => ({
    config,
    authenticate,
  })),
}));

// @ts-expect-error - plain JS module without type declarations
import api from '../api.js';
// @ts-expect-error - aliased to the .ts source for api.js's dynamic import
import { MspaApiClient } from '../lib/mspa-api/client.ts';

const VALID = { email: 'a@b.c', password: 'secret', region: 'row' };

describe('validateCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.mockResolvedValue('token');
  });

  it('reports success when the credentials authenticate', async () => {
    const res = await api.validateCredentials({ homey: {}, body: VALID });
    expect(res).toEqual({ success: true });
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('passes the credentials straight to a throwaway client', async () => {
    await api.validateCredentials({ homey: {}, body: VALID });
    expect(MspaApiClient).toHaveBeenCalledWith(VALID);
  });

  it.each(['email', 'password', 'region'])(
    'refuses to call the API when %s is missing',
    async (missing) => {
      const body: Record<string, unknown> = { ...VALID };
      delete body[missing];
      await expect(api.validateCredentials({ homey: {}, body }))
        .rejects.toThrow(/required/);
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('refuses an empty credential rather than trying it', async () => {
    await expect(api.validateCredentials({ homey: {}, body: { ...VALID, password: '' } }))
      .rejects.toThrow(/required/);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('surfaces the upstream reason when authentication fails', async () => {
    authenticate.mockRejectedValue(new Error('Invalid email or password'));
    await expect(api.validateCredentials({ homey: {}, body: VALID }))
      .rejects.toThrow('Invalid email or password');
  });

  it('degrades to a stated reason when the failure carries no message', async () => {
    // Fails closed with an explicit error rather than reporting success.
    authenticate.mockRejectedValue({});
    await expect(api.validateCredentials({ homey: {}, body: VALID }))
      .rejects.toThrow('Authentication failed');
  });

  it('never puts the password in the thrown message', async () => {
    authenticate.mockRejectedValue(new Error('bad creds'));
    await expect(api.validateCredentials({ homey: {}, body: VALID }))
      .rejects.toThrow(/^(?!.*secret).*$/);
  });
});
