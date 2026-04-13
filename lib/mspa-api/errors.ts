/**
 * Error classes for M-Spa API client
 */

/** Error thrown when authentication fails (e.g., wrong password) */
export class MspaAuthError extends Error {
  public readonly code: number;
  public readonly retryable = false;

  constructor(message: string, code: number = 16019) {
    super(message);
    this.name = 'MspaAuthError';
    this.code = code;
  }
}

/** Error thrown when rate limited by the API */
export class MspaRateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly retryable = true;

  constructor(retryAfterMs: number) {
    super(`Rate limited. Retry after ${retryAfterMs}ms`);
    this.name = 'MspaRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Error thrown for network issues or HTTP errors */
export class MspaNetworkError extends Error {
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'MspaNetworkError';
    this.statusCode = statusCode;
    // Network errors and 5xx responses are retryable, 4xx are not
    this.retryable = statusCode === undefined || statusCode >= 500;
  }
}
