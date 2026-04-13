/**
 * Throttle utility for M-Spa API client
 * Enforces minimum 0.4s spacing between API calls
 */

export class MspaThrottle {
  private lastCall: number = 0;
  private pending: Promise<void> | null = null;
  private readonly minInterval = 400; // 0.4 seconds in milliseconds

  /**
   * Acquire the throttle lock and ensure minimum interval has passed
   * @returns Promise that resolves when it's safe to make an API call
   */
  async acquire(): Promise<void> {
    // If there's already a pending acquisition, wait for it to complete
    if (this.pending !== null) {
      await this.pending;
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastCall;

    if (elapsed < this.minInterval) {
      // Need to wait before making the call
      const delay = this.minInterval - elapsed;
      this.pending = new Promise<void>(resolve => {
        setTimeout(() => {
          this.lastCall = Date.now();
          this.pending = null;
          resolve();
        }, delay);
      });
      return this.pending;
    } else {
      // Already enough time has passed
      this.lastCall = now;
      this.pending = null;
    }
  }
}
