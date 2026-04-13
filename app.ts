import Homey from 'homey';
import { MspaApiClient } from './lib/mspa-api/client.js';

export default class MspaApp extends Homey.App {
  private apiClient: MspaApiClient | null = null;

  async onInit() {
    this.log('M-Spa Hot Tub app initialized');
    this.updateApiClient();

    // Listen for settings changes
    this.homey.settings.on('set', (key) => {
      const value = this.homey.settings.get(key);
      this.log(`Setting changed: ${key} = ${key === 'password' ? '********' : value}`);
      this.updateApiClient();
    });
  }

  /**
   * Update the API client based on current settings
   */
  private updateApiClient() {
    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    const region = this.homey.settings.get('region');
    
    this.log(`Current settings: email=${email}, region=${region}, password=${password ? 'set' : 'not set'}`);

    if (email && password && region) {
      try {
        this.apiClient = new MspaApiClient({ email, password, region });
        this.log('API client updated with new credentials');
      } catch (err: any) {
        this.error(`Failed to initialize API client: ${err.message}`);
        this.apiClient = null;
      }
    } else {
      this.apiClient = null;
    }
  }

  /**
   * Get the active API client
   */
  getApiClient(): MspaApiClient | null {
    return this.apiClient;
  }
}
