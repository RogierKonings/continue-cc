import { CodeContext } from '../context/contextExtractor';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

interface CacheEntry {
  completions: vscode.CompletionItem[];
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export class CompletionCache {
  private readonly cache: Map<string, CacheEntry>;
  private readonly logger: Logger;

  // Configuration
  private readonly maxCacheSize = 100;
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
  private readonly maxMemoryUsage = 50 * 1024 * 1024; // 50MB

  // Metrics
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor() {
    this.cache = new Map();
    this.logger = new Logger('CompletionCache');

    // Set up periodic cleanup
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  get(context: CodeContext): vscode.CompletionItem[] | undefined {
    const key = this.generateKey(context);
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.missCount++;
      return undefined;
    }

    // Update access info
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.hitCount++;
    this.logger.debug(`Cache hit for key ${key}`);

    return entry.completions;
  }

  set(context: CodeContext, completions: vscode.CompletionItem[]): void {
    const key = this.generateKey(context);

    // Check cache size and evict if necessary
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    // Check memory usage
    if (this.getEstimatedMemoryUsage() > this.maxMemoryUsage) {
      this.evictOldest();
    }

    const entry: CacheEntry = {
      completions,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.logger.debug(`Cached completions for key ${key}`);
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.clear();
      return;
    }

    // Invalidate entries matching pattern
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      this.evictionCount++;
    });

    this.logger.info(
      `Invalidated ${keysToDelete.length} cache entries matching pattern: ${pattern}`
    );
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.evictionCount += size;
    this.logger.info('Cache cleared');
  }

  private generateKey(context: CodeContext): string {
    // Use context hash if available, otherwise generate from content
    if (context.hash) {
      return context.hash;
    }

    // Generate key from essential context properties
    const keyParts = [
      context.language,
      context.prefix.slice(-100), // Last 100 chars of prefix
      context.currentLine,
      context.imports.slice(0, 5).join(','), // First 5 imports
      context.cursorPosition.line.toString(),
      context.cursorPosition.character.toString(),
    ];

    return this.hashString(keyParts.join('|'));
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.defaultTTL;
  }

  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.evictionCount++;
      this.logger.debug(`Evicted LRU entry: ${lruKey}`);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictionCount++;
      this.logger.debug(`Evicted oldest entry: ${oldestKey}`);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.defaultTTL) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      this.evictionCount++;
    });

    if (keysToDelete.length > 0) {
      this.logger.info(`Cleaned up ${keysToDelete.length} expired entries`);
    }
  }

  private getEstimatedMemoryUsage(): number {
    // Rough estimation of memory usage
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      // Estimate size of completion items
      totalSize += entry.completions.reduce((size, item) => {
        const labelLength =
          typeof item.label === 'string' ? item.label.length : item.label.label.length;
        return (
          size +
          labelLength * 2 + // Unicode chars
          (item.detail?.length || 0) * 2 +
          (item.documentation?.toString().length || 0) * 2 +
          100
        ); // Overhead per item
      }, 0);

      // Add entry overhead
      totalSize += 100;
    }

    return totalSize;
  }

  // Performance metrics
  getMetrics(): {
    size: number;
    hitRate: number;
    missRate: number;
    evictionCount: number;
    estimatedMemoryUsage: number;
  } {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.missCount / totalRequests : 0;

    return {
      size: this.cache.size,
      hitRate: hitRate * 100,
      missRate: missRate * 100,
      evictionCount: this.evictionCount,
      estimatedMemoryUsage: this.getEstimatedMemoryUsage(),
    };
  }

  resetMetrics(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }
}
