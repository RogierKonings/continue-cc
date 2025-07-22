export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  static fromNetworkError(error: unknown): AuthenticationError {
    return new AuthenticationError(
      'Network error: Please check your internet connection',
      'NETWORK_ERROR',
      { originalError: error }
    );
  }

  static fromInvalidCredentials(): AuthenticationError {
    return new AuthenticationError(
      'Invalid credentials: Please check your API key or login details',
      'INVALID_CREDENTIALS'
    );
  }

  static fromExpiredToken(): AuthenticationError {
    return new AuthenticationError(
      'Your session has expired. Please sign in again.',
      'TOKEN_EXPIRED'
    );
  }

  static fromRateLimit(retryAfter?: number): AuthenticationError {
    return new AuthenticationError(
      `Rate limit exceeded. ${retryAfter ? `Try again in ${retryAfter} seconds.` : 'Please try again later.'}`,
      'RATE_LIMITED',
      { retryAfter }
    );
  }
}