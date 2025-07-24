import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { CompletionRequest, CompletionResponse } from './types';
import { OfflineCache } from './offlineCache';
import { Logger } from '../utils/logger';
import { NetworkError, RateLimitError } from './errors';

export enum FallbackMode {
  NORMAL = 'normal',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  CRITICAL = 'critical',
}

interface FallbackOptions {
  enableCache?: boolean;
  enableQueueing?: boolean;
  enableLocalModel?: boolean;
  reduceContext?: boolean;
  manualCompletion?: boolean;
}

export class FallbackManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly cache: OfflineCache;
  private mode: FallbackMode = FallbackMode.NORMAL;
  private requestQueue: Array<{
    request: CompletionRequest;
    resolve: (value: CompletionResponse) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private readonly maxQueueSize = 50;
  private readonly maxQueueAge = 5 * 60 * 1000; // 5 minutes

  constructor(context: vscode.ExtensionContext) {
    super();
    this.logger = new Logger('FallbackManager');
    this.cache = new OfflineCache(context);

    this.startQueueProcessor();
  }

  public setMode(mode: FallbackMode): void {
    if (this.mode !== mode) {
      const oldMode = this.mode;
      this.mode = mode;
      this.logger.info(`Fallback mode changed from ${oldMode} to ${mode}`);
      this.emit('modeChanged', mode, oldMode);

      if (mode === FallbackMode.NORMAL) {
        this.processQueue();
      }
    }
  }

  public async handleRequest(
    request: CompletionRequest,
    executeRequest: () => Promise<CompletionResponse>
  ): Promise<CompletionResponse> {
    // Check cache first
    const cachedResponse = await this.checkCache(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Apply degraded mode transformations
    const transformedRequest = this.transformRequest(request);

    try {
      // Try to execute the request
      const response = await executeRequest();

      // Cache successful responses
      await this.cache.set(transformedRequest, response);

      return response;
    } catch (error) {
      return this.handleError(error, transformedRequest);
    }
  }

  private async checkCache(request: CompletionRequest): Promise<CompletionResponse | null> {
    if (this.mode === FallbackMode.OFFLINE || this.mode === FallbackMode.CRITICAL) {
      const cached = await this.cache.get(request);
      if (cached) {
        this.logger.info('Using cached response in fallback mode');
        return cached;
      }
    }
    return null;
  }

  private transformRequest(request: CompletionRequest): CompletionRequest {
    if (this.mode === FallbackMode.DEGRADED || this.mode === FallbackMode.CRITICAL) {
      return {
        ...request,
        // Reduce context size to save tokens
        context: request.context ? this.reduceContext(request.context) : undefined,
        // Lower token limit
        maxTokens: Math.min(request.maxTokens || 150, 100),
        // More deterministic completions
        temperature: Math.min(request.temperature || 0.2, 0.1),
      };
    }
    return request;
  }

  private reduceContext(context: string): string {
    // Keep only the most relevant parts of the context
    const lines = context.split('\n');
    const maxLines = 50;

    if (lines.length <= maxLines) {
      return context;
    }

    // Keep first 25 and last 25 lines
    const firstLines = lines.slice(0, 25);
    const lastLines = lines.slice(-25);

    return [...firstLines, '// ... context truncated ...', ...lastLines].join('\n');
  }

  private async handleError(
    error: unknown,
    request: CompletionRequest
  ): Promise<CompletionResponse> {
    if (error instanceof NetworkError) {
      this.setMode(FallbackMode.OFFLINE);
      return this.handleOfflineRequest(request);
    }

    if (error instanceof RateLimitError) {
      this.setMode(FallbackMode.DEGRADED);
      return this.handleRateLimitedRequest(request);
    }

    // Try cache as last resort
    const cached = await this.cache.get(request);
    if (cached) {
      return cached;
    }

    throw error;
  }

  private async handleOfflineRequest(request: CompletionRequest): Promise<CompletionResponse> {
    // First, try cache
    const cached = await this.cache.get(request);
    if (cached) {
      return cached;
    }

    // Queue for later if possible
    if (this.requestQueue.length < this.maxQueueSize) {
      return this.queueRequest(request);
    }

    // Provide manual completion fallback
    return this.provideManualFallback(request);
  }

  private async handleRateLimitedRequest(request: CompletionRequest): Promise<CompletionResponse> {
    // Try cache with similar requests
    const cached = await this.findSimilarCachedResponse(request);
    if (cached) {
      return cached;
    }

    // Queue for later
    if (this.requestQueue.length < this.maxQueueSize) {
      return this.queueRequest(request);
    }

    // Provide degraded response
    return this.provideDegradedResponse(request);
  }

  private async findSimilarCachedResponse(
    request: CompletionRequest
  ): Promise<CompletionResponse | null> {
    // Try with reduced context
    const reducedRequest = {
      ...request,
      context: request.context ? this.reduceContext(request.context) : undefined,
    };

    return this.cache.get(reducedRequest);
  }

  private queueRequest(request: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.logger.info(`Request queued for retry (queue size: ${this.requestQueue.length})`);

      vscode.window
        .showInformationMessage('Request queued for when connection is restored', 'View Queue')
        .then((action) => {
          if (action === 'View Queue') {
            this.showQueueStatus();
          }
        });
    });
  }

  private provideManualFallback(request: CompletionRequest): CompletionResponse {
    vscode.window.showWarningMessage(
      'No connection available. Type your completion manually.',
      'OK'
    );

    return {
      completion: '',
      requestId: request.requestId || 'manual',
      cached: false,
    };
  }

  private provideDegradedResponse(request: CompletionRequest): CompletionResponse {
    // Provide a basic template based on the language
    const templates: Record<string, string> = {
      javascript: '// TODO: Implement',
      typescript: '// TODO: Implement',
      python: '# TODO: Implement',
      java: '// TODO: Implement',
      csharp: '// TODO: Implement',
      go: '// TODO: Implement',
      rust: '// TODO: Implement',
    };

    const completion = templates[request.language || 'javascript'] || '// TODO: Implement';

    return {
      completion,
      requestId: request.requestId || 'degraded',
      cached: false,
    };
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      this.cleanupQueue();

      if (this.mode === FallbackMode.NORMAL && this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, 10000); // Check every 10 seconds
  }

  private cleanupQueue(): void {
    const now = Date.now();
    this.requestQueue = this.requestQueue.filter((item) => {
      if (now - item.timestamp > this.maxQueueAge) {
        item.reject(new Error('Request expired in queue'));
        return false;
      }
      return true;
    });
  }

  private async processQueue(): Promise<void> {
    // Process queue in batches to avoid overwhelming the API
    const batch = this.requestQueue.splice(0, 5);

    for (const item of batch) {
      try {
        // This would need to be implemented with actual API client
        this.logger.info('Processing queued request');
        // const response = await this.apiClient.getCompletion(item.request);
        // item.resolve(response);
      } catch (error) {
        item.reject(error as Error);
      }
    }
  }

  private showQueueStatus(): void {
    vscode.window.showInformationMessage(
      `${this.requestQueue.length} requests queued. Mode: ${this.mode}`
    );
  }

  public getOptions(): FallbackOptions {
    switch (this.mode) {
      case FallbackMode.OFFLINE:
        return {
          enableCache: true,
          enableQueueing: true,
          enableLocalModel: false,
          reduceContext: true,
          manualCompletion: true,
        };

      case FallbackMode.DEGRADED:
        return {
          enableCache: true,
          enableQueueing: true,
          enableLocalModel: false,
          reduceContext: true,
          manualCompletion: false,
        };

      case FallbackMode.CRITICAL:
        return {
          enableCache: true,
          enableQueueing: false,
          enableLocalModel: false,
          reduceContext: true,
          manualCompletion: true,
        };

      default:
        return {
          enableCache: false,
          enableQueueing: false,
          enableLocalModel: false,
          reduceContext: false,
          manualCompletion: false,
        };
    }
  }

  public getStats(): {
    mode: FallbackMode;
    queueSize: number;
    cacheStats: ReturnType<OfflineCache['getStats']>;
  } {
    return {
      mode: this.mode,
      queueSize: this.requestQueue.length,
      cacheStats: this.cache.getStats(),
    };
  }

  public dispose(): void {
    this.cache.dispose();
    this.requestQueue.forEach((item) => {
      item.reject(new Error('Fallback manager disposed'));
    });
    this.requestQueue = [];
    this.removeAllListeners();
  }
}
