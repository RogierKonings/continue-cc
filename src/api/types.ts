export interface APIEndpoints {
  completion: string;
  validate: string;
  user: string;
  usage: string;
}

export interface CompletionRequest {
  prompt: string;
  context?: string;
  language?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  requestId?: string;
}

export interface CompletionResponse {
  completion: string;
  requestId: string;
  usage?: TokenUsage;
  cached?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UserInfo {
  id: string;
  email: string;
  subscription: SubscriptionTier;
  quotaUsage: QuotaUsage;
}

export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  MAX = 'max',
}

export interface QuotaUsage {
  requests: {
    minute: number;
    hour: number;
    day: number;
  };
  tokens: {
    day: number;
    month: number;
  };
}

export interface RateLimits {
  requests: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  tokens: {
    perDay: number;
    perMonth: number;
  };
}

export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface UsageStats {
  period: 'day' | 'month';
  requests: number;
  tokens: number;
  percentageUsed: number;
}

export interface APIConfig {
  baseURL: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  version: string;
}

export interface StreamChunk {
  id: string;
  content: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface ValidationResponse {
  valid: boolean;
  user?: UserInfo;
  expiresAt?: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface RequestContext {
  requestId: string;
  timestamp: number;
  method: string;
  url: string;
  retryCount?: number;
}
