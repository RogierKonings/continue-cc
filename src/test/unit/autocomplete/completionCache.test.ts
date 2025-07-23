import * as vscode from 'vscode';
import { CompletionCache } from '../../../autocomplete/cache/completionCache';
import { CodeContext } from '../../../autocomplete/context/contextExtractor';

describe('CompletionCache', () => {
  let cache: CompletionCache;
  let mockContext: CodeContext;
  let mockCompletions: vscode.CompletionItem[];

  beforeEach(() => {
    cache = new CompletionCache();

    mockContext = {
      language: 'typescript',
      currentLine: 'const test = ',
      prefix: 'const test = ',
      suffix: '',
      imports: ['react', 'lodash'],
      symbols: [],
      fileContent: 'full content',
      cursorPosition: new vscode.Position(10, 13),
      indentation: '  ',
      hash: 'test-hash-123',
    };

    mockCompletions = [
      new vscode.CompletionItem('console', vscode.CompletionItemKind.Class),
      new vscode.CompletionItem('log', vscode.CompletionItemKind.Method),
    ];

    // Mock timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('basic operations', () => {
    it('should store and retrieve completions', () => {
      cache.set(mockContext, mockCompletions);
      const retrieved = cache.get(mockContext);

      expect(retrieved).toEqual(mockCompletions);
    });

    it('should return undefined for non-existent entries', () => {
      const retrieved = cache.get(mockContext);

      expect(retrieved).toBeUndefined();
    });

    it('should use context hash as key', () => {
      cache.set(mockContext, mockCompletions);

      // Change context but keep same hash
      const modifiedContext = { ...mockContext, currentLine: 'different line' };
      const retrieved = cache.get(modifiedContext);

      expect(retrieved).toEqual(mockCompletions);
    });

    it('should generate key if hash is missing', () => {
      const contextWithoutHash = { ...mockContext, hash: undefined };
      cache.set(contextWithoutHash, mockCompletions);

      const retrieved = cache.get(contextWithoutHash);

      expect(retrieved).toEqual(mockCompletions);
    });
  });

  describe('cache expiration', () => {
    it('should expire entries after TTL', () => {
      cache.set(mockContext, mockCompletions);

      // Advance time past TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      const retrieved = cache.get(mockContext);

      expect(retrieved).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      cache.set(mockContext, mockCompletions);

      // Advance time but not past TTL
      jest.advanceTimersByTime(4 * 60 * 1000);

      const retrieved = cache.get(mockContext);

      expect(retrieved).toEqual(mockCompletions);
    });
  });

  describe('cache eviction', () => {
    it('should evict LRU entry when cache is full', () => {
      // Set max cache size to a small number for testing
      (cache as any).maxCacheSize = 3;

      // Add entries
      const contexts = Array.from({ length: 4 }, (_, i) => ({
        ...mockContext,
        hash: `hash-${i}`,
      }));

      contexts.forEach((ctx, i) => {
        cache.set(ctx, mockCompletions);
        if (i < 3) {
          // Access first 3 entries to update their access time
          jest.advanceTimersByTime(1000);
          cache.get(ctx);
        }
      });

      // First entry should be evicted (least recently used)
      expect(cache.get(contexts[0])).toBeUndefined();
      expect(cache.get(contexts[1])).toBeDefined();
      expect(cache.get(contexts[2])).toBeDefined();
      expect(cache.get(contexts[3])).toBeDefined();
    });
  });

  describe('cache invalidation', () => {
    it('should clear entire cache when no pattern provided', () => {
      cache.set(mockContext, mockCompletions);
      cache.set({ ...mockContext, hash: 'another-hash' }, mockCompletions);

      cache.invalidate();

      expect(cache.get(mockContext)).toBeUndefined();
      expect(cache.get({ ...mockContext, hash: 'another-hash' })).toBeUndefined();
    });

    it('should invalidate entries matching pattern', () => {
      const context1 = { ...mockContext, hash: 'typescript-file-1' };
      const context2 = { ...mockContext, hash: 'javascript-file-2' };
      const context3 = { ...mockContext, hash: 'typescript-file-3' };

      cache.set(context1, mockCompletions);
      cache.set(context2, mockCompletions);
      cache.set(context3, mockCompletions);

      cache.invalidate('typescript');

      expect(cache.get(context1)).toBeUndefined();
      expect(cache.get(context2)).toBeDefined();
      expect(cache.get(context3)).toBeUndefined();
    });
  });

  describe('metrics', () => {
    it('should track hit and miss rates', () => {
      cache.set(mockContext, mockCompletions);

      // 2 hits
      cache.get(mockContext);
      cache.get(mockContext);

      // 1 miss
      cache.get({ ...mockContext, hash: 'non-existent' });

      const metrics = cache.getMetrics();

      expect(metrics.hitRate).toBeCloseTo(66.67, 1);
      expect(metrics.missRate).toBeCloseTo(33.33, 1);
    });

    it('should track cache size', () => {
      cache.set(mockContext, mockCompletions);
      cache.set({ ...mockContext, hash: 'another' }, mockCompletions);

      const metrics = cache.getMetrics();

      expect(metrics.size).toBe(2);
    });

    it('should track eviction count', () => {
      (cache as any).maxCacheSize = 2;

      cache.set(mockContext, mockCompletions);
      cache.set({ ...mockContext, hash: 'hash-2' }, mockCompletions);
      cache.set({ ...mockContext, hash: 'hash-3' }, mockCompletions); // Should trigger eviction

      const metrics = cache.getMetrics();

      expect(metrics.evictionCount).toBe(1);
    });

    it('should estimate memory usage', () => {
      cache.set(mockContext, mockCompletions);

      const metrics = cache.getMetrics();

      expect(metrics.estimatedMemoryUsage).toBeGreaterThan(0);
    });

    it('should reset metrics', () => {
      cache.set(mockContext, mockCompletions);
      cache.get(mockContext);
      cache.get({ ...mockContext, hash: 'miss' });

      cache.resetMetrics();
      const metrics = cache.getMetrics();

      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(0);
      expect(metrics.evictionCount).toBe(0);
    });
  });

  describe('periodic cleanup', () => {
    it('should clean up expired entries periodically', () => {
      cache.set(mockContext, mockCompletions);
      cache.set({ ...mockContext, hash: 'hash-2' }, mockCompletions);

      // Advance time past TTL
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Trigger cleanup interval
      jest.runOnlyPendingTimers();

      expect(cache.get(mockContext)).toBeUndefined();
      expect(cache.get({ ...mockContext, hash: 'hash-2' })).toBeUndefined();
    });
  });

  describe('access tracking', () => {
    it('should update access count and time on get', () => {
      cache.set(mockContext, mockCompletions);

      const initialTime = Date.now();
      jest.advanceTimersByTime(1000);

      cache.get(mockContext);
      cache.get(mockContext);

      // Access internal cache to verify
      const entry = cache['cache'].get(mockContext.hash!);

      expect(entry?.accessCount).toBe(2);
      expect(entry?.lastAccessed).toBeGreaterThan(initialTime);
    });
  });

  describe('memory management', () => {
    it('should evict oldest entry when memory limit exceeded', () => {
      // Mock memory usage to be high
      (cache as any).getEstimatedMemoryUsage = jest.fn().mockReturnValue(60 * 1024 * 1024);

      const context1 = { ...mockContext, hash: 'old-entry' };
      const context2 = { ...mockContext, hash: 'new-entry' };

      cache.set(context1, mockCompletions);
      jest.advanceTimersByTime(1000);
      cache.set(context2, mockCompletions);

      // Old entry should be evicted due to memory pressure
      expect(cache.get(context1)).toBeUndefined();
      expect(cache.get(context2)).toBeDefined();
    });
  });
});
