import type * as vscode from 'vscode';
import type { CompletionRequest, CompletionResponse } from './types';
import { Logger } from '../utils/logger';
import * as crypto from 'crypto';

interface CacheEntry {
  request: CompletionRequest;
  response: CompletionResponse;
  timestamp: number;
  hitCount: number;
  lastAccessed: number;
}

export class OfflineCache {
  private readonly logger: Logger;
  private readonly context: vscode.ExtensionContext;
  private cache: Map<string, CacheEntry>;
  private readonly maxCacheSize: number;
  private readonly maxCacheAge: number;
  private readonly maxMemoryUsage: number;
  private currentMemoryUsage: number = 0;

  constructor(
    context: vscode.ExtensionContext,
    options?: {
      maxCacheSize?: number;
      maxCacheAge?: number;
      maxMemoryUsage?: number;
    }
  ) {
    this.logger = new Logger('OfflineCache');
    this.context = context;
    this.maxCacheSize = options?.maxCacheSize || 1000;
    this.maxCacheAge = options?.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.maxMemoryUsage = options?.maxMemoryUsage || 50 * 1024 * 1024; // 50MB

    this.cache = new Map();
    this.loadCache();
    this.startCleanupInterval();
  }

  private generateCacheKey(request: CompletionRequest): string {
    const keyData = {
      prompt: request.prompt,
      context: request.context,
      language: request.language,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    };

    return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  }

  private loadCache(): void {
    try {
      const storedCache = this.context.globalState.get<[string, CacheEntry][]>('offlineCache');
      if (storedCache) {
        this.cache = new Map(storedCache);
        this.calculateMemoryUsage();
        this.logger.info(`Loaded ${this.cache.size} cache entries`);
      }
    } catch (error) {
      this.logger.error('Failed to load cache', error);
    }
  }

  private saveCache(): void {
    try {
      const cacheArray = Array.from(this.cache.entries());
      this.context.globalState.update('offlineCache', cacheArray);
    } catch (error) {
      this.logger.error('Failed to save cache', error);
    }
  }

  private calculateMemoryUsage(): void {
    this.currentMemoryUsage = 0;
    for (const [_, entry] of this.cache) {
      this.currentMemoryUsage += this.estimateEntrySize(entry);
    }
  }

  private estimateEntrySize(entry: CacheEntry): number {
    const jsonString = JSON.stringify(entry);
    return jsonString.length * 2; // Rough estimate: 2 bytes per character
  }

  public async get(request: CompletionRequest): Promise<CompletionResponse | null> {
    const key = this.generateCacheKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.maxCacheAge) {
      this.cache.delete(key);
      return null;
    }

    // Update access information
    entry.hitCount++;
    entry.lastAccessed = Date.now();

    this.logger.debug('Cache hit', {
      key,
      age: Math.round(age / 1000),
      hitCount: entry.hitCount,
    });

    return {
      ...entry.response,
      cached: true,
    };
  }

  public async set(request: CompletionRequest, response: CompletionResponse): Promise<void> {
    const key = this.generateCacheKey(request);
    const entry: CacheEntry = {
      request,
      response,
      timestamp: Date.now(),
      hitCount: 0,
      lastAccessed: Date.now(),
    };

    const entrySize = this.estimateEntrySize(entry);

    // Check memory limits
    if (this.currentMemoryUsage + entrySize > this.maxMemoryUsage) {
      this.evictLRU();
    }

    // Check cache size limits
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.currentMemoryUsage += entrySize;

    // Save periodically, not on every write
    if (this.cache.size % 10 === 0) {
      this.saveCache();
    }

    this.logger.debug('Cache set', {
      key,
      cacheSize: this.cache.size,
      memoryUsage: Math.round(this.currentMemoryUsage / 1024),
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.currentMemoryUsage -= this.estimateEntrySize(entry);
      }
      this.cache.delete(oldestKey);
      this.logger.debug('Evicted cache entry', { key: oldestKey });
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxCacheAge) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const entry = this.cache.get(key);
      if (entry) {
        this.currentMemoryUsage -= this.estimateEntrySize(entry);
      }
      this.cache.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.info(`Cleaned up ${keysToDelete.length} expired cache entries`);
      this.saveCache();
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every hour
    setInterval(
      () => {
        this.cleanup();
      },
      60 * 60 * 1000
    );
  }

  public clear(): void {
    this.cache.clear();
    this.currentMemoryUsage = 0;
    this.saveCache();
    this.logger.info('Cache cleared');
  }

  public getStats(): {
    size: number;
    memoryUsage: number;
    hitRate: number;
    oldestEntry: number;
  } {
    let totalHits = 0;
    let totalRequests = 0;
    let oldestTimestamp = Date.now();

    for (const [_, entry] of this.cache) {
      totalHits += entry.hitCount;
      totalRequests += entry.hitCount + 1;
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      memoryUsage: this.currentMemoryUsage,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      oldestEntry: Date.now() - oldestTimestamp,
    };
  }

  public dispose(): void {
    this.saveCache();
  }
}
