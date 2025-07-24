import type { RequestContext } from './types';

export enum ErrorCode {
  NETWORK_ERROR = 'E001',
  AUTH_FAILED = 'E002',
  RATE_LIMITED = 'E003',
  SERVER_ERROR = 'E004',
  INVALID_REQUEST = 'E005',
  TIMEOUT = 'E006',
  UNKNOWN = 'E999',
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  SERVER = 'server',
  CLIENT = 'client',
  UNKNOWN = 'unknown',
}

export abstract class APIError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly requestContext?: RequestContext;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;
  public readonly userMessage: string;
  public readonly timestamp: number;

  constructor(
    message: string,
    code: ErrorCode,
    category: ErrorCategory,
    options?: {
      requestContext?: RequestContext;
      statusCode?: number;
      isRetryable?: boolean;
      userMessage?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.requestContext = options?.requestContext;
    this.statusCode = options?.statusCode;
    this.isRetryable = options?.isRetryable ?? false;
    this.userMessage = options?.userMessage ?? this.getDefaultUserMessage();
    this.timestamp = Date.now();

    if (options?.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }

  protected abstract getDefaultUserMessage(): string;

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      userMessage: this.userMessage,
      timestamp: this.timestamp,
      requestContext: this.requestContext,
      stack: this.stack,
    };
  }

  public serialize(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

export class NetworkError extends APIError {
  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.NETWORK_ERROR, ErrorCategory.NETWORK, {
      ...options,
      isRetryable: true,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'Unable to reach Claude Code. Check your internet connection.';
  }
}

export class AuthenticationError extends APIError {
  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      statusCode?: number;
    }
  ) {
    super(message, ErrorCode.AUTH_FAILED, ErrorCategory.AUTHENTICATION, {
      ...options,
      isRetryable: false,
      statusCode: options?.statusCode ?? 401,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'Authentication expired. Click here to sign in again.';
  }
}

export class RateLimitError extends APIError {
  public readonly retryAfter?: number;
  public readonly limitInfo?: {
    limit: number;
    remaining: number;
    reset: number;
  };

  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      retryAfter?: number;
      limitInfo?: {
        limit: number;
        remaining: number;
        reset: number;
      };
    }
  ) {
    super(message, ErrorCode.RATE_LIMITED, ErrorCategory.RATE_LIMIT, {
      ...options,
      statusCode: 429,
      isRetryable: true,
    });
    this.retryAfter = options?.retryAfter;
    this.limitInfo = options?.limitInfo;
  }

  protected getDefaultUserMessage(): string {
    if (this.retryAfter) {
      return `You've reached the rate limit. Please wait ${this.retryAfter} seconds.`;
    }
    return "You've reached 80% of your daily limit. Completions may be limited.";
  }

  public toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    return {
      ...json,
      retryAfter: this.retryAfter,
      limitInfo: this.limitInfo,
    };
  }
}

export class ServerError extends APIError {
  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      statusCode?: number;
    }
  ) {
    super(message, ErrorCode.SERVER_ERROR, ErrorCategory.SERVER, {
      ...options,
      statusCode: options?.statusCode ?? 500,
      isRetryable: true,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'Claude Code is experiencing issues. Your request has been queued.';
  }
}

export class InvalidRequestError extends APIError {
  public readonly validationErrors?: Record<string, string[]>;

  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      validationErrors?: Record<string, string[]>;
    }
  ) {
    super(message, ErrorCode.INVALID_REQUEST, ErrorCategory.CLIENT, {
      ...options,
      statusCode: 400,
      isRetryable: false,
    });
    this.validationErrors = options?.validationErrors;
  }

  protected getDefaultUserMessage(): string {
    return 'Invalid request. Please check your input and try again.';
  }

  public toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    return {
      ...json,
      validationErrors: this.validationErrors,
    };
  }
}

export class TimeoutError extends APIError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    options?: {
      requestContext?: RequestContext;
    }
  ) {
    super(message, ErrorCode.TIMEOUT, ErrorCategory.NETWORK, {
      ...options,
      isRetryable: true,
    });
    this.timeoutMs = timeoutMs;
  }

  protected getDefaultUserMessage(): string {
    return `Request timed out after ${this.timeoutMs / 1000} seconds. Please try again.`;
  }

  public toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    return {
      ...json,
      timeoutMs: this.timeoutMs,
    };
  }
}

export class UnknownError extends APIError {
  constructor(
    message: string,
    options?: {
      requestContext?: RequestContext;
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.UNKNOWN, ErrorCategory.UNKNOWN, {
      ...options,
      isRetryable: false,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'An unexpected error occurred. Please try again later.';
  }
}

export function parseErrorResponse(error: unknown, requestContext?: RequestContext): APIError {
  if (error instanceof APIError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === 'NetworkError' || error.message.includes('network')) {
      return new NetworkError(error.message, { requestContext, cause: error });
    }

    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return new TimeoutError(error.message, 30000, { requestContext });
    }
  }

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as any).response;
    const status = response?.status;
    const data = response?.data;

    switch (status) {
      case 401:
        return new AuthenticationError(data?.error?.message || 'Unauthorized', {
          requestContext,
          statusCode: status,
        });
      case 429:
        return new RateLimitError(data?.error?.message || 'Rate limit exceeded', {
          requestContext,
          retryAfter: parseInt(response.headers?.['retry-after'] || '60'),
          limitInfo: {
            limit: parseInt(response.headers?.['x-ratelimit-limit'] || '0'),
            remaining: parseInt(response.headers?.['x-ratelimit-remaining'] || '0'),
            reset: parseInt(response.headers?.['x-ratelimit-reset'] || '0'),
          },
        });
      case 400:
        return new InvalidRequestError(data?.error?.message || 'Bad request', {
          requestContext,
          validationErrors: data?.error?.details,
        });
      case 500:
      case 502:
      case 503:
      case 504:
        return new ServerError(data?.error?.message || 'Server error', {
          requestContext,
          statusCode: status,
        });
    }
  }

  return new UnknownError(error instanceof Error ? error.message : String(error), {
    requestContext,
  });
}
