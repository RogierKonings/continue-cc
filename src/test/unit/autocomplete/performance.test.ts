import * as vscode from 'vscode';
import { ClaudeCompletionProvider } from '../../../autocomplete/providers/claudeCompletionProvider';
import { ContextExtractor } from '../../../autocomplete/context/contextExtractor';
import { DebouncedCompletionManager } from '../../../autocomplete/performance/debouncedCompletionManager';
import { CompletionCache } from '../../../autocomplete/cache/completionCache';

jest.mock('vscode');
jest.mock('../../../utils/logger');

describe('Autocomplete Performance Tests', () => {
  let provider: ClaudeCompletionProvider;
  let mockDocument: vscode.TextDocument;
  let mockPosition: vscode.Position;
  let mockToken: vscode.CancellationToken;
  let mockContext: vscode.CompletionContext;

  beforeEach(() => {
    provider = new ClaudeCompletionProvider();

    // Create a large mock document
    const largeContent = Array(10000).fill('const line = "test";\n').join('');

    mockDocument = {
      languageId: 'typescript',
      lineCount: 10000,
      lineAt: jest.fn((line: number) => ({
        text: 'const line = "test";',
        range: new vscode.Range(line, 0, line, 20),
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: false,
      })),
      getText: jest.fn((range?: vscode.Range) => {
        if (!range) return largeContent;
        return 'partial content';
      }),
      offsetAt: jest.fn(() => 50000),
      uri: vscode.Uri.file('/test/large-file.ts'),
      fileName: '/test/large-file.ts',
      version: 1,
    } as any;

    mockPosition = new vscode.Position(5000, 10);

    mockToken = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn(),
    };

    mockContext = {
      triggerKind: vscode.CompletionTriggerKind.Invoke,
      triggerCharacter: undefined,
    };

    // Mock vscode.commands.executeCommand for symbols
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    provider.dispose();
    jest.clearAllMocks();
  });

  describe('Context Extraction Performance', () => {
    it('should extract context within 50ms for large files', async () => {
      const extractor = new ContextExtractor();

      const startTime = performance.now();
      await extractor.extractContext(mockDocument, mockPosition);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should use cache effectively for repeated extractions', async () => {
      const extractor = new ContextExtractor();

      // First extraction
      const start1 = performance.now();
      await extractor.extractContext(mockDocument, mockPosition);
      const duration1 = performance.now() - start1;

      // Second extraction (should use cache)
      const start2 = performance.now();
      await extractor.extractContext(mockDocument, mockPosition);
      const duration2 = performance.now() - start2;

      expect(duration2).toBeLessThan(duration1 * 0.5);
    });

    it('should handle concurrent extractions efficiently', async () => {
      const extractor = new ContextExtractor();

      const startTime = performance.now();

      // Simulate concurrent requests
      const promises = Array(10)
        .fill(null)
        .map((_, i) => extractor.extractContext(mockDocument, new vscode.Position(i * 100, 10)));

      await Promise.all(promises);
      const duration = performance.now() - startTime;

      // Should complete all within reasonable time
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Completion Provider Performance', () => {
    it('should provide completions within 200ms', async () => {
      const startTime = performance.now();

      await provider.provideCompletionItems(mockDocument, mockPosition, mockToken, mockContext);

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);
    });

    it('should handle rapid completion requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map((_, i) => ({
          position: new vscode.Position(i, 10),
          promise: provider.provideCompletionItems(
            mockDocument,
            new vscode.Position(i, 10),
            mockToken,
            mockContext
          ),
        }));

      const results = await Promise.all(requests.map((r) => r.promise));

      expect(results.every((r) => r !== undefined)).toBe(true);
    });
  });

  describe('Cache Performance', () => {
    it('should achieve >70% cache hit rate with repeated patterns', async () => {
      const cache = new CompletionCache();
      const contexts = Array(10)
        .fill(null)
        .map((_, i) => ({
          language: 'typescript',
          currentLine: `const var${i % 3} = `,
          prefix: `const var${i % 3} = `,
          suffix: '',
          imports: [],
          symbols: [],
          fileContent: '',
          cursorPosition: new vscode.Position(i, 10),
          indentation: '',
          hash: `hash-${i % 3}`,
        }));

      // Populate cache
      contexts.forEach((ctx, i) => {
        if (i < 3) {
          cache.set(ctx, []);
        }
      });

      // Access patterns
      contexts.forEach((ctx) => {
        cache.get(ctx);
      });

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBeGreaterThan(70);
    });

    it('should maintain memory usage under 50MB', () => {
      const cache = new CompletionCache();

      // Add many entries
      for (let i = 0; i < 100; i++) {
        const completions = Array(20)
          .fill(null)
          .map((_, j) => new vscode.CompletionItem(`item${j}`, vscode.CompletionItemKind.Variable));

        cache.set(
          {
            language: 'typescript',
            currentLine: `line${i}`,
            prefix: `prefix${i}`,
            suffix: '',
            imports: [],
            symbols: [],
            fileContent: '',
            cursorPosition: new vscode.Position(i, 0),
            indentation: '',
            hash: `hash${i}`,
          },
          completions
        );
      }

      const metrics = cache.getMetrics();
      expect(metrics.estimatedMemoryUsage).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Debouncing Performance', () => {
    it('should reduce API calls by >70% with debouncing', async () => {
      const manager = new DebouncedCompletionManager();
      let apiCallCount = 0;

      // Mock the fetch methods to count calls
      manager['fetchCompletions'] = jest.fn().mockImplementation(async () => {
        apiCallCount++;
        return [];
      });

      jest.useFakeTimers();

      // Simulate rapid typing (10 keystrokes)
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          manager.getCompletions(
            {
              language: 'typescript',
              currentLine: `const test${i}`,
              prefix: `const test${i}`,
              suffix: '',
              imports: [],
              symbols: [],
              fileContent: '',
              cursorPosition: new vscode.Position(0, 10 + i),
              indentation: '',
              hash: `hash${i}`,
            },
            mockToken
          )
        );

        jest.advanceTimersByTime(50); // 50ms between keystrokes
      }

      // Allow final debounce to complete
      jest.advanceTimersByTime(300);

      await Promise.allSettled(promises);

      // Should have significantly fewer API calls than keystrokes
      expect(apiCallCount).toBeLessThan(3);
      expect(apiCallCount / 10).toBeLessThan(0.3); // <30% of original

      jest.useRealTimers();
      manager.dispose();
    });

    it('should maintain low CPU usage during rapid typing', async () => {
      const manager = new DebouncedCompletionManager();

      jest.useFakeTimers();
      const startTime = performance.now();

      // Simulate very rapid typing
      for (let i = 0; i < 50; i++) {
        manager.getCompletions(
          {
            language: 'typescript',
            currentLine: `text${i}`,
            prefix: `text${i}`,
            suffix: '',
            imports: [],
            symbols: [],
            fileContent: '',
            cursorPosition: new vscode.Position(0, i),
            indentation: '',
            hash: `hash${i}`,
          },
          mockToken
        );

        jest.advanceTimersByTime(20); // Very fast typing
      }

      const cpuTime = performance.now() - startTime;

      // CPU time should be minimal despite many requests
      expect(cpuTime).toBeLessThan(50);

      jest.useRealTimers();
      manager.dispose();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak memory with extended use', async () => {
      const provider = new ClaudeCompletionProvider();

      // Simulate extended use
      for (let i = 0; i < 100; i++) {
        await provider.provideCompletionItems(
          mockDocument,
          new vscode.Position(i, 0),
          mockToken,
          mockContext
        );
      }

      // Check that caches are bounded
      const cacheSize = (provider as any).cache.cache.size;
      expect(cacheSize).toBeLessThan(100);

      provider.dispose();
    });

    it('should clean up cancelled requests properly', async () => {
      const manager = new DebouncedCompletionManager();

      // Track pending requests before
      const initialPending = manager['pendingRequests'].size;

      // Create and cancel multiple requests
      const cancelledTokens: vscode.CancellationToken[] = [];

      for (let i = 0; i < 10; i++) {
        let cancelled = false;
        const token: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: (cb) => {
            setTimeout(() => {
              cancelled = true;
              cb(null);
            }, 10);
            return { dispose: jest.fn() };
          },
        };

        cancelledTokens.push(token);

        manager
          .getCompletions(
            {
              language: 'typescript',
              currentLine: '',
              prefix: '',
              suffix: '',
              imports: [],
              symbols: [],
              fileContent: '',
              cursorPosition: new vscode.Position(0, 0),
              indentation: '',
              hash: `cancel${i}`,
            },
            token
          )
          .catch(() => {}); // Ignore cancellation errors
      }

      // Wait for cancellations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // All pending requests should be cleaned up
      expect(manager['pendingRequests'].size).toBe(initialPending);

      manager.dispose();
    });
  });

  describe('Stress Testing', () => {
    it('should handle 100+ concurrent completion requests', async () => {
      const provider = new ClaudeCompletionProvider();

      const promises = Array(100)
        .fill(null)
        .map((_, i) =>
          provider.provideCompletionItems(
            mockDocument,
            new vscode.Position(i, 0),
            mockToken,
            mockContext
          )
        );

      const startTime = performance.now();
      const results = await Promise.allSettled(promises);
      const duration = performance.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);

      // Most should succeed
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(successCount / results.length).toBeGreaterThan(0.95);

      provider.dispose();
    });
  });
});
