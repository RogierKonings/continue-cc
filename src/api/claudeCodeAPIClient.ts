import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import type {
  APIConfig,
  APIEndpoints,
  CompletionRequest,
  CompletionResponse,
  RequestContext,
  StreamChunk,
  UserInfo,
  UsageStats,
  ValidationResponse,
  RateLimitHeaders,
} from './types';
import { parseErrorResponse, AuthenticationError, NetworkError } from './errors';
import type { TokenManager } from '../auth/tokenManager';
import { Logger } from '../utils/logger';
import { FallbackManager, FallbackMode } from './fallbackManager';
import { NotificationManager } from './notificationManager';

const DEFAULT_CONFIG: APIConfig = {
  baseURL: 'https://api.claude.ai',
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  version: 'v1',
};

const API_ENDPOINTS: APIEndpoints = {
  completion: '/v1/completion',
  validate: '/v1/auth/validate',
  user: '/v1/user/info',
  usage: '/v1/user/usage',
};

export class ClaudeCodeAPIClient extends EventEmitter {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: APIConfig;
  private readonly tokenManager: TokenManager;
  private readonly logger: Logger;
  private readonly fallbackManager?: FallbackManager;
  private readonly notificationManager: NotificationManager;
  private isOnline: boolean = true;
  private requestIdCounter: number = 0;

  constructor(
    tokenManager: TokenManager,
    config: Partial<APIConfig> = {},
    context?: vscode.ExtensionContext
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenManager = tokenManager;
    this.logger = new Logger('ClaudeCodeAPIClient');
    this.notificationManager = new NotificationManager();

    // Initialize fallback manager if context is provided
    if (context) {
      this.fallbackManager = new FallbackManager(context);
      this.fallbackManager.on('modeChanged', (mode) => {
        this.emit('fallbackModeChanged', mode);
      });
    }

    // Set up notification manager event handlers
    this.notificationManager.on('retryRequested', (error) => {
      this.emit('retryRequested', error);
    });

    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `claude-code-continue/${vscode.extensions.getExtension('claude-code-continue')?.packageJSON.version || '0.0.1'}`,
      },
    });

    this.setupInterceptors();
    this.setupRetryLogic();
    this.checkConnectivity();
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await this.tokenManager.getValidToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        config.headers['X-Request-ID'] = this.generateRequestId();
        config.headers['X-API-Version'] = this.config.version;

        const context: RequestContext = {
          requestId: config.headers['X-Request-ID'] as string,
          timestamp: Date.now(),
          method: config.method?.toUpperCase() || 'GET',
          url: config.url || '',
        };

        (config as any).requestContext = context;

        this.logger.debug('Request started', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
        });

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        const requestContext = (response.config as any).requestContext;

        this.logger.debug('Request completed', {
          requestId: requestContext?.requestId,
          status: response.status,
          duration: Date.now() - requestContext?.timestamp,
        });

        this.handleRateLimitHeaders(response);
        this.handleDeprecationWarnings(response);

        return response;
      },
      async (error) => {
        const requestContext = (error.config as any)?.requestContext;

        this.logger.error('Request failed', {
          requestId: requestContext?.requestId,
          error: error.message,
          status: error.response?.status,
        });

        const apiError = parseErrorResponse(error, requestContext);

        if (apiError instanceof AuthenticationError) {
          await this.tokenManager.clearToken();
          this.emit('authenticationError', apiError);
        }

        if (apiError instanceof NetworkError) {
          this.handleOffline();
        }

        // Notify user of the error
        this.notificationManager.notifyError(apiError);

        throw apiError;
      }
    );
  }

  private setupRetryLogic(): void {
    axiosRetry(this.axiosInstance, {
      retries: this.config.maxRetries,
      retryDelay: (retryCount, error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            return parseInt(retryAfter) * 1000;
          }
        }

        const baseDelay = this.config.retryDelay;
        const jitter = Math.random() * 1000;
        return Math.min(baseDelay * Math.pow(2, retryCount - 1) + jitter, 30000);
      },
      retryCondition: (error) => {
        if (!this.isOnline) {
          return false;
        }

        const apiError = parseErrorResponse(error);
        return apiError.isRetryable;
      },
      onRetry: (retryCount, error, requestConfig) => {
        const context = (requestConfig as any).requestContext;
        if (context) {
          context.retryCount = retryCount;
        }

        this.logger.info('Retrying request', {
          requestId: context?.requestId,
          retryCount,
          error: error.message,
        });
      },
    });
  }

  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.requestIdCounter).toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `req_${timestamp}_${counter}_${random}`;
  }

  private handleRateLimitHeaders(response: AxiosResponse): void {
    const headers = response.headers;
    const rateLimitInfo: RateLimitHeaders = {
      limit: parseInt(headers['x-ratelimit-limit'] || '0'),
      remaining: parseInt(headers['x-ratelimit-remaining'] || '0'),
      reset: parseInt(headers['x-ratelimit-reset'] || '0'),
      retryAfter: headers['retry-after'] ? parseInt(headers['retry-after']) : undefined,
    };

    if (rateLimitInfo.limit > 0) {
      this.emit('rateLimitInfo', rateLimitInfo);
    }
  }

  private handleDeprecationWarnings(response: AxiosResponse): void {
    const deprecationWarning = response.headers['x-api-deprecation-warning'];
    if (deprecationWarning) {
      this.logger.warn('API deprecation warning', { warning: deprecationWarning });
      this.emit('deprecationWarning', deprecationWarning);
    }
  }

  private async checkConnectivity(): Promise<void> {
    try {
      await axios.head('https://api.claude.ai', { timeout: 5000 });
      this.handleOnline();
    } catch {
      this.handleOffline();
    }
  }

  private handleOffline(): void {
    if (this.isOnline) {
      this.isOnline = false;
      this.emit('offline');
      this.logger.info('API client went offline');

      if (this.fallbackManager) {
        this.fallbackManager.setMode(FallbackMode.OFFLINE);
      }
    }
  }

  private handleOnline(): void {
    if (!this.isOnline) {
      this.isOnline = true;
      this.emit('online');
      this.logger.info('API client is back online');

      if (this.fallbackManager) {
        this.fallbackManager.setMode(FallbackMode.NORMAL);
      }
    }
  }

  public async getCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.fallbackManager) {
      return this.fallbackManager.handleRequest(request, async () => {
        if (!this.isOnline && !request.stream) {
          throw new NetworkError('No network connection available');
        }

        const response = await this.axiosInstance.post<CompletionResponse>(
          API_ENDPOINTS.completion,
          this.buildCompletionPayload(request),
          {
            headers: {
              'X-Request-Priority': request.stream ? 'high' : 'normal',
            },
          }
        );

        return this.transformCompletionResponse(
          response.data,
          (response.config as any).requestContext
        );
      });
    }

    // Fallback to original implementation if no fallback manager
    if (!this.isOnline && !request.stream) {
      throw new NetworkError('No network connection available');
    }

    try {
      const response = await this.axiosInstance.post<CompletionResponse>(
        API_ENDPOINTS.completion,
        this.buildCompletionPayload(request),
        {
          headers: {
            'X-Request-Priority': request.stream ? 'high' : 'normal',
          },
        }
      );

      return this.transformCompletionResponse(
        response.data,
        (response.config as any).requestContext
      );
    } catch (error) {
      throw parseErrorResponse(error, (error as any).config?.requestContext);
    }
  }

  public async getCompletionStream(
    request: CompletionRequest
  ): Promise<ReadableStream<StreamChunk>> {
    if (!this.isOnline) {
      throw new NetworkError('No network connection available for streaming');
    }

    try {
      const response = await this.axiosInstance.post(
        API_ENDPOINTS.completion,
        this.buildCompletionPayload({ ...request, stream: true }),
        {
          responseType: 'stream',
          headers: {
            Accept: 'text/event-stream',
            'X-Request-Priority': 'high',
          },
        }
      );

      return this.createStreamFromResponse(response);
    } catch (error) {
      throw parseErrorResponse(error, (error as any).config?.requestContext);
    }
  }

  public async validateToken(): Promise<ValidationResponse> {
    try {
      const response = await this.axiosInstance.get<ValidationResponse>(API_ENDPOINTS.validate);
      return response.data;
    } catch (error) {
      throw parseErrorResponse(error, (error as any).config?.requestContext);
    }
  }

  public async getUserInfo(): Promise<UserInfo> {
    try {
      const response = await this.axiosInstance.get<UserInfo>(API_ENDPOINTS.user);
      return response.data;
    } catch (error) {
      throw parseErrorResponse(error, (error as any).config?.requestContext);
    }
  }

  public async getUsageStats(period: 'day' | 'month' = 'day'): Promise<UsageStats> {
    try {
      const response = await this.axiosInstance.get<UsageStats>(API_ENDPOINTS.usage, {
        params: { period },
      });
      return response.data;
    } catch (error) {
      throw parseErrorResponse(error, (error as any).config?.requestContext);
    }
  }

  private buildCompletionPayload(request: CompletionRequest): Record<string, unknown> {
    return {
      prompt: request.prompt,
      context: request.context,
      language: request.language,
      max_tokens: request.maxTokens ?? 150,
      temperature: request.temperature ?? 0.2,
      stream: request.stream ?? false,
      request_id: request.requestId,
    };
  }

  private transformCompletionResponse(
    response: CompletionResponse,
    context?: RequestContext
  ): CompletionResponse {
    return {
      ...response,
      requestId: context?.requestId || response.requestId,
      cached: response.cached ?? false,
    };
  }

  private createStreamFromResponse(response: AxiosResponse): ReadableStream<StreamChunk> {
    const stream = response.data;
    const decoder = new TextDecoder();

    return new ReadableStream<StreamChunk>({
      async start(controller) {
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                controller.enqueue(data);
              } catch (e) {
                console.error('Failed to parse stream chunk:', e);
              }
            }
          }
        });

        stream.on('end', () => {
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.slice(6));
              controller.enqueue(data);
            } catch (e) {
              console.error('Failed to parse final stream chunk:', e);
            }
          }
          controller.close();
        });

        stream.on('error', (error: Error) => {
          controller.error(parseErrorResponse(error));
        });
      },
    });
  }

  public get online(): boolean {
    return this.isOnline;
  }

  public dispose(): void {
    if (this.fallbackManager) {
      this.fallbackManager.dispose();
    }
    this.notificationManager.dispose();
    this.removeAllListeners();
  }
}
