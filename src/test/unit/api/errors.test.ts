import { expect } from 'chai';
import {
  APIError,
  NetworkError,
  AuthenticationError,
  RateLimitError,
  ServerError,
  InvalidRequestError,
  TimeoutError,
  UnknownError,
  parseErrorResponse,
  ErrorCode,
  ErrorCategory,
} from '../../../api/errors';
import { RequestContext } from '../../../api/types';

describe('API Errors', () => {
  const mockRequestContext: RequestContext = {
    requestId: 'test-123',
    timestamp: Date.now(),
    method: 'POST',
    url: '/v1/completion',
  };

  describe('NetworkError', () => {
    it('should create network error with correct properties', () => {
      const error = new NetworkError('Network failed', { requestContext: mockRequestContext });

      expect(error).to.be.instanceOf(APIError);
      expect(error.code).to.equal(ErrorCode.NETWORK_ERROR);
      expect(error.category).to.equal(ErrorCategory.NETWORK);
      expect(error.isRetryable).to.be.true;
      expect(error.userMessage).to.equal(
        'Unable to reach Claude Code. Check your internet connection.'
      );
      expect(error.requestContext).to.deep.equal(mockRequestContext);
    });

    it('should serialize correctly', () => {
      const error = new NetworkError('Network failed');
      const json = error.toJSON();

      expect(json).to.have.property('name', 'NetworkError');
      expect(json).to.have.property('message', 'Network failed');
      expect(json).to.have.property('code', ErrorCode.NETWORK_ERROR);
      expect(json).to.have.property('timestamp');
    });
  });

  describe('AuthenticationError', () => {
    it('should create auth error with 401 status by default', () => {
      const error = new AuthenticationError('Token expired');

      expect(error.code).to.equal(ErrorCode.AUTH_FAILED);
      expect(error.category).to.equal(ErrorCategory.AUTHENTICATION);
      expect(error.statusCode).to.equal(401);
      expect(error.isRetryable).to.be.false;
      expect(error.userMessage).to.equal('Authentication expired. Click here to sign in again.');
    });
  });

  describe('RateLimitError', () => {
    it('should include retry-after and limit info', () => {
      const error = new RateLimitError('Rate limit exceeded', {
        retryAfter: 60,
        limitInfo: {
          limit: 100,
          remaining: 0,
          reset: Date.now() + 3600000,
        },
      });

      expect(error.code).to.equal(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).to.equal(429);
      expect(error.isRetryable).to.be.true;
      expect(error.retryAfter).to.equal(60);
      expect(error.limitInfo?.limit).to.equal(100);
      expect(error.userMessage).to.include('60 seconds');
    });

    it('should show percentage message without retry-after', () => {
      const error = new RateLimitError('Rate limit exceeded');
      expect(error.userMessage).to.include('80%');
    });
  });

  describe('ServerError', () => {
    it('should create server error with 500 status', () => {
      const error = new ServerError('Internal server error');

      expect(error.code).to.equal(ErrorCode.SERVER_ERROR);
      expect(error.category).to.equal(ErrorCategory.SERVER);
      expect(error.statusCode).to.equal(500);
      expect(error.isRetryable).to.be.true;
    });
  });

  describe('InvalidRequestError', () => {
    it('should include validation errors', () => {
      const validationErrors = {
        prompt: ['Prompt is required', 'Prompt must be a string'],
        maxTokens: ['Must be positive'],
      };

      const error = new InvalidRequestError('Invalid request', {
        validationErrors,
      });

      expect(error.code).to.equal(ErrorCode.INVALID_REQUEST);
      expect(error.statusCode).to.equal(400);
      expect(error.isRetryable).to.be.false;
      expect(error.validationErrors).to.deep.equal(validationErrors);
    });
  });

  describe('TimeoutError', () => {
    it('should include timeout duration', () => {
      const error = new TimeoutError('Request timed out', 30000);

      expect(error.code).to.equal(ErrorCode.TIMEOUT);
      expect(error.category).to.equal(ErrorCategory.NETWORK);
      expect(error.isRetryable).to.be.true;
      expect(error.timeoutMs).to.equal(30000);
      expect(error.userMessage).to.include('30 seconds');
    });
  });

  describe('parseErrorResponse', () => {
    it('should return existing APIError unchanged', () => {
      const error = new NetworkError('Test');
      const result = parseErrorResponse(error);
      expect(result).to.equal(error);
    });

    it('should parse axios 401 response', () => {
      const axiosError = {
        response: {
          status: 401,
          data: {
            error: { message: 'Unauthorized access' },
          },
        },
      };

      const result = parseErrorResponse(axiosError, mockRequestContext);

      expect(result).to.be.instanceOf(AuthenticationError);
      expect(result.message).to.equal('Unauthorized access');
      expect(result.requestContext).to.equal(mockRequestContext);
    });

    it('should parse axios 429 response with headers', () => {
      const axiosError = {
        response: {
          status: 429,
          headers: {
            'retry-after': '120',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1234567890',
          },
          data: {
            error: { message: 'Too many requests' },
          },
        },
      };

      const result = parseErrorResponse(axiosError) as RateLimitError;

      expect(result).to.be.instanceOf(RateLimitError);
      expect(result.retryAfter).to.equal(120);
      expect(result.limitInfo?.limit).to.equal(100);
      expect(result.limitInfo?.remaining).to.equal(0);
    });

    it('should parse axios 400 response with validation errors', () => {
      const axiosError = {
        response: {
          status: 400,
          data: {
            error: {
              message: 'Validation failed',
              details: {
                prompt: ['Required field'],
              },
            },
          },
        },
      };

      const result = parseErrorResponse(axiosError) as InvalidRequestError;

      expect(result).to.be.instanceOf(InvalidRequestError);
      expect(result.validationErrors).to.deep.equal({
        prompt: ['Required field'],
      });
    });

    it('should parse network errors', () => {
      const error = new Error('Network Error');
      error.name = 'NetworkError';

      const result = parseErrorResponse(error);

      expect(result).to.be.instanceOf(NetworkError);
    });

    it('should parse timeout errors', () => {
      const error = new Error('Request timeout');

      const result = parseErrorResponse(error);

      expect(result).to.be.instanceOf(TimeoutError);
    });

    it('should return UnknownError for unrecognized errors', () => {
      const result = parseErrorResponse('String error');

      expect(result).to.be.instanceOf(UnknownError);
      expect(result.message).to.equal('String error');
    });
  });
});
