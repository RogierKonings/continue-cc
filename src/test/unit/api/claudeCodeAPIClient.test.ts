import { expect } from 'chai';
import * as sinon from 'sinon';
import axios, { AxiosInstance } from 'axios';
import { ClaudeCodeAPIClient } from '../../../api/claudeCodeAPIClient';
import { TokenManager } from '../../../auth/tokenManager';
import {
  CompletionRequest,
  CompletionResponse,
  ValidationResponse,
  UserInfo,
  SubscriptionTier,
} from '../../../api/types';
import { AuthenticationError, RateLimitError } from '../../../api/errors';

describe('ClaudeCodeAPIClient', () => {
  let apiClient: ClaudeCodeAPIClient;
  let mockTokenManager: TokenManager;
  let axiosStub: sinon.SinonStubbedInstance<AxiosInstance>;
  let axiosCreateStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock TokenManager
    mockTokenManager = {
      getValidToken: sinon.stub().resolves('test-token'),
      clearToken: sinon.stub().resolves(),
    } as any;

    // Create axios instance stub
    axiosStub = {
      interceptors: {
        request: { use: sinon.stub() },
        response: { use: sinon.stub() },
      },
      post: sinon.stub(),
      get: sinon.stub(),
    } as any;

    // Stub axios.create
    axiosCreateStub = sinon.stub(axios, 'create').returns(axiosStub as any);

    // Create API client
    apiClient = new ClaudeCodeAPIClient(mockTokenManager);
  });

  afterEach(() => {
    sinon.restore();
    apiClient.dispose();
  });

  describe('Initialization', () => {
    it('should create axios instance with correct config', () => {
      expect(axiosCreateStub).to.have.been.calledWith({
        baseURL: 'https://api.claude.ai',
        timeout: 30000,
        headers: sinon.match({
          'Content-Type': 'application/json',
          'User-Agent': sinon.match(/claude-code-continue/),
        }),
      });
    });

    it('should setup request and response interceptors', () => {
      expect(axiosStub.interceptors.request.use).to.have.been.called;
      expect(axiosStub.interceptors.response.use).to.have.been.called;
    });
  });

  describe('getCompletion', () => {
    const mockRequest: CompletionRequest = {
      prompt: 'test prompt',
      context: 'test context',
      language: 'typescript',
    };

    const mockResponse: CompletionResponse = {
      completion: 'test completion',
      requestId: 'req_123',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };

    it('should make completion request with correct payload', async () => {
      axiosStub.post.resolves({
        data: mockResponse,
        config: { requestContext: { requestId: 'req_123' } },
      });

      const result = await apiClient.getCompletion(mockRequest);

      expect(axiosStub.post).to.have.been.calledWith('/v1/completion', {
        prompt: 'test prompt',
        context: 'test context',
        language: 'typescript',
        max_tokens: 150,
        temperature: 0.2,
        stream: false,
        request_id: undefined,
      });

      expect(result).to.deep.equal(mockResponse);
    });

    it('should throw NetworkError when offline', async () => {
      (apiClient as any).isOnline = false;

      try {
        await apiClient.getCompletion(mockRequest);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.include('No network connection');
      }
    });
  });

  describe('validateToken', () => {
    it('should validate token successfully', async () => {
      const mockValidation: ValidationResponse = {
        valid: true,
        user: {
          id: 'user123',
          email: 'test@example.com',
          subscription: SubscriptionTier.MAX,
          quotaUsage: {
            requests: { minute: 0, hour: 0, day: 0 },
            tokens: { day: 0, month: 0 },
          },
        },
      };

      axiosStub.get.resolves({ data: mockValidation });

      const result = await apiClient.validateToken();

      expect(axiosStub.get).to.have.been.calledWith('/v1/auth/validate');
      expect(result).to.deep.equal(mockValidation);
    });
  });

  describe('getUserInfo', () => {
    it('should fetch user info', async () => {
      const mockUserInfo: UserInfo = {
        id: 'user123',
        email: 'test@example.com',
        subscription: SubscriptionTier.PRO,
        quotaUsage: {
          requests: { minute: 5, hour: 100, day: 500 },
          tokens: { day: 5000, month: 100000 },
        },
      };

      axiosStub.get.resolves({ data: mockUserInfo });

      const result = await apiClient.getUserInfo();

      expect(axiosStub.get).to.have.been.calledWith('/v1/user/info');
      expect(result).to.deep.equal(mockUserInfo);
    });
  });

  describe('getUsageStats', () => {
    it('should fetch usage stats with period', async () => {
      const mockUsageStats = {
        period: 'month',
        requests: 1000,
        tokens: 50000,
        percentageUsed: 50,
      };

      axiosStub.get.resolves({ data: mockUsageStats });

      const result = await apiClient.getUsageStats('month');

      expect(axiosStub.get).to.have.been.calledWith('/v1/user/usage', {
        params: { period: 'month' },
      });
      expect(result).to.deep.equal(mockUsageStats);
    });
  });

  describe('Error handling', () => {
    it('should handle authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: { error: { message: 'Invalid token' } },
        },
        config: { requestContext: { requestId: 'req_123' } },
      };

      axiosStub.post.rejects(authError);

      let emittedError: any;
      apiClient.on('authenticationError', (error) => {
        emittedError = error;
      });

      try {
        await apiClient.getCompletion({ prompt: 'test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect(mockTokenManager.clearToken).to.have.been.called;
        expect(emittedError).to.exist;
      }
    });

    it('should handle rate limit errors with headers', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          headers: {
            'retry-after': '60',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1234567890',
          },
          data: { error: { message: 'Rate limit exceeded' } },
        },
        config: { requestContext: { requestId: 'req_123' } },
      };

      axiosStub.post.rejects(rateLimitError);

      try {
        await apiClient.getCompletion({ prompt: 'test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).to.equal(60);
        expect((error as RateLimitError).limitInfo?.limit).to.equal(100);
      }
    });
  });

  describe('Request tracking', () => {
    it('should generate unique request IDs', async () => {
      const requestInterceptor = axiosStub.interceptors.request.use.getCall(0).args[0];

      const config1 = await requestInterceptor({ headers: {} });
      const config2 = await requestInterceptor({ headers: {} });

      expect(config1.headers['X-Request-ID']).to.exist;
      expect(config2.headers['X-Request-ID']).to.exist;
      expect(config1.headers['X-Request-ID']).to.not.equal(config2.headers['X-Request-ID']);
    });

    it('should add authorization header', async () => {
      const requestInterceptor = axiosStub.interceptors.request.use.getCall(0).args[0];

      const config = await requestInterceptor({ headers: {} });

      expect(config.headers.Authorization).to.equal('Bearer test-token');
      expect(mockTokenManager.getValidToken).to.have.been.called;
    });
  });

  describe('Rate limit handling', () => {
    it('should emit rate limit info from headers', async () => {
      const responseInterceptor = axiosStub.interceptors.response.use.getCall(0).args[0];

      let emittedInfo: any;
      apiClient.on('rateLimitInfo', (info) => {
        emittedInfo = info;
      });

      const response = {
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '50',
          'x-ratelimit-reset': '1234567890',
        },
        config: { requestContext: { requestId: 'req_123' } },
      };

      await responseInterceptor(response);

      expect(emittedInfo).to.deep.equal({
        limit: 100,
        remaining: 50,
        reset: 1234567890,
        retryAfter: undefined,
      });
    });
  });

  describe('Deprecation warnings', () => {
    it('should emit deprecation warnings', async () => {
      const responseInterceptor = axiosStub.interceptors.response.use.getCall(0).args[0];

      let emittedWarning: any;
      apiClient.on('deprecationWarning', (warning) => {
        emittedWarning = warning;
      });

      const response = {
        headers: {
          'x-api-deprecation-warning': 'This endpoint will be removed in v2',
        },
        config: { requestContext: { requestId: 'req_123' } },
      };

      await responseInterceptor(response);

      expect(emittedWarning).to.equal('This endpoint will be removed in v2');
    });
  });

  describe('Connectivity', () => {
    it('should emit offline event when connection fails', async () => {
      let offlineEmitted = false;
      apiClient.on('offline', () => {
        offlineEmitted = true;
      });

      // Trigger offline handling
      (apiClient as any).handleOffline();

      expect(offlineEmitted).to.be.true;
      expect(apiClient.online).to.be.false;
    });

    it('should emit online event when connection restored', async () => {
      // First go offline
      (apiClient as any).handleOffline();

      let onlineEmitted = false;
      apiClient.on('online', () => {
        onlineEmitted = true;
      });

      // Then go online
      (apiClient as any).handleOnline();

      expect(onlineEmitted).to.be.true;
      expect(apiClient.online).to.be.true;
    });
  });
});
