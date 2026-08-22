/**
 * API for Homey App
 * This file contains methods exposed to the frontend (e.g. settings page)
 */

export default {
  /**
   * Validate credentials against the M-Spa API
   */
  async validateCredentials({ homey, body }) {
    const { email, password, region } = body;
    
    if (!email || !password || !region) {
      throw new Error('Email, password, and region are required');
    }

    const app = homey.app;
    
    try {
      // Create a temporary client to test the credentials
      const { MspaApiClient } = await import('./lib/mspa-api/client.js');
      const testClient = new MspaApiClient({ email, password, region });
      
      await testClient.authenticate();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      throw new Error(message || 'Authentication failed');
    }
  },
};
