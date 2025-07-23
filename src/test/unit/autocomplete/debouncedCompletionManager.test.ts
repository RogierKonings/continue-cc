import * as vscode from 'vscode';
import { DebouncedCompletionManager } from '../../../autocomplete/performance/debouncedCompletionManager';
import { CodeContext } from '../../../autocomplete/context/contextExtractor';

jest.mock('vscode');

describe('DebouncedCompletionManager', () => {
  let manager: DebouncedCompletionManager;
  let mockContext: CodeContext;
  let mockCancellationToken: vscode.CancellationToken;

  beforeEach(() => {
    manager = new DebouncedCompletionManager();

    mockContext = {
      language: 'typescript',
      currentLine: 'console.',
      prefix: 'console.',
      suffix: '',
      imports: [],
      symbols: [],
      fileContent: '',
      cursorPosition: new vscode.Position(10, 8),
      indentation: '',
      hash: 'test-hash',
    };

    mockCancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn(),
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getCompletions', () => {
    it('should debounce completion requests', async () => {
      const promise1 = manager.getCompletions(mockContext, mockCancellationToken);
      const promise2 = manager.getCompletions(mockContext, mockCancellationToken);

      // Fast-forward time to trigger debounced execution
      jest.advanceTimersByTime(300);

      const results = await Promise.all([promise1, promise2]);

      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    });

    it('should trigger immediately for special characters', async () => {
      mockContext.currentLine = 'object.';
      mockContext.cursorPosition = new vscode.Position(10, 7);

      const fetchSpy = jest.spyOn(manager as any, 'fetchCompletions');

      const promise = manager.getCompletions(mockContext, mockCancellationToken);

      // Should not need to advance timers for immediate trigger
      jest.advanceTimersByTime(0);

      await promise;

      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should cancel pending requests', async () => {
      const context1 = { ...mockContext, hash: 'hash1' };
      const context2 = { ...mockContext, hash: 'hash2' };

      const promise1 = manager.getCompletions(context1, mockCancellationToken);

      // Start second request before first completes
      jest.advanceTimersByTime(50);
      const promise2 = manager.getCompletions(context2, mockCancellationToken);

      jest.advanceTimersByTime(300);

      const results = await Promise.allSettled([promise1, promise2]);

      expect(results[1].status).toBe('fulfilled');
    });

    it('should handle cancellation token', async () => {
      let cancelCallback: Function;
      mockCancellationToken.onCancellationRequested = jest.fn((cb) => {
        cancelCallback = cb;
        return { dispose: jest.fn() };
      });

      const promise = manager.getCompletions(mockContext, mockCancellationToken);

      // Simulate cancellation
      cancelCallback!();

      await expect(promise).rejects.toThrow('Request cancelled');
    });
  });

  describe('getInlineCompletions', () => {
    it('should use longer debounce for inline completions', async () => {
      const fetchSpy = jest.spyOn(manager as any, 'fetchInlineCompletions');

      manager.getInlineCompletions(mockContext, mockCancellationToken);

      // Should not be called yet
      jest.advanceTimersByTime(200);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Should be called after longer delay
      jest.advanceTimersByTime(300);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should format inline completions correctly', async () => {
      const promise = manager.getInlineCompletions(mockContext, mockCancellationToken);

      jest.advanceTimersByTime(500);

      const results = await promise;

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toBeInstanceOf(vscode.InlineCompletionItem);
    });
  });

  describe('adaptive debouncing', () => {
    it('should adjust delay based on typing speed', async () => {
      // Simulate fast typing
      manager['typingSpeed'] = 6;
      const delay1 = manager['calculateDebounceDelay'](mockContext);
      expect(delay1).toBe(300); // Max delay for fast typing

      // Simulate medium typing
      manager['typingSpeed'] = 3;
      const delay2 = manager['calculateDebounceDelay'](mockContext);
      expect(delay2).toBe(200); // Medium delay

      // Simulate slow typing
      manager['typingSpeed'] = 1;
      const delay3 = manager['calculateDebounceDelay'](mockContext);
      expect(delay3).toBe(100); // Min delay for slow typing
    });

    it('should update typing speed on each request', async () => {
      const promise1 = manager.getCompletions(mockContext, mockCancellationToken);
      jest.advanceTimersByTime(100);

      const promise2 = manager.getCompletions(mockContext, mockCancellationToken);
      jest.advanceTimersByTime(300);

      await Promise.all([promise1, promise2]);

      expect(manager['typingSpeed']).toBeGreaterThan(0);
    });
  });

  describe('request management', () => {
    it('should track pending requests', async () => {
      const promise1 = manager.getCompletions(
        { ...mockContext, hash: 'req1' },
        mockCancellationToken
      );
      const promise2 = manager.getCompletions(
        { ...mockContext, hash: 'req2' },
        mockCancellationToken
      );

      expect(manager['pendingRequests'].size).toBeGreaterThan(0);

      jest.advanceTimersByTime(300);
      await Promise.all([promise1, promise2]);

      expect(manager['pendingRequests'].size).toBe(0);
    });

    it('should handle abort errors gracefully', async () => {
      // Mock fetch to throw abort error
      manager['fetchCompletions'] = jest.fn().mockRejectedValue(new Error('AbortError'));

      const promise = manager.getCompletions(mockContext, mockCancellationToken);
      jest.advanceTimersByTime(300);

      const result = await promise;

      expect(result).toEqual([]);
    });

    it('should propagate non-abort errors', async () => {
      // Mock fetch to throw other error
      manager['fetchCompletions'] = jest.fn().mockRejectedValue(new Error('Network error'));

      const promise = manager.getCompletions(mockContext, mockCancellationToken);
      jest.advanceTimersByTime(300);

      await expect(promise).rejects.toThrow('Network error');
    });
  });

  describe('immediate triggers', () => {
    const immediateTestCases = [
      { char: '.', line: 'object.' },
      { char: '->', line: 'ptr->' },
      { char: '::', line: 'std::' },
      { char: '(', line: 'function(' },
      { char: '[', line: 'array[' },
      { char: '{', line: 'obj = {' },
    ];

    immediateTestCases.forEach(({ char, line }) => {
      it(`should trigger immediately for "${char}"`, async () => {
        mockContext.currentLine = line;
        mockContext.cursorPosition = new vscode.Position(10, line.length);

        const shouldTrigger = manager['shouldTriggerImmediately'](mockContext);

        expect(shouldTrigger).toBe(true);
      });
    });

    it('should not trigger immediately for regular characters', () => {
      mockContext.currentLine = 'const value = ';
      mockContext.cursorPosition = new vscode.Position(10, 14);

      const shouldTrigger = manager['shouldTriggerImmediately'](mockContext);

      expect(shouldTrigger).toBe(false);
    });
  });

  describe('completion formatting', () => {
    it('should format completion items with proper metadata', async () => {
      const promise = manager.getCompletions(mockContext, mockCancellationToken);
      jest.advanceTimersByTime(300);

      const results = await promise;

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toBeDefined();
      expect(results[0].kind).toBeDefined();
      expect(results[0].sortText).toBeDefined();
      expect(results[0].command).toBeDefined();
      expect(results[0].command?.command).toBe('continue-cc.trackCompletion');
    });
  });

  describe('metrics', () => {
    it('should provide performance metrics', () => {
      const metrics = manager.getMetrics();

      expect(metrics).toHaveProperty('pendingRequests');
      expect(metrics).toHaveProperty('averageTypingSpeed');
      expect(metrics).toHaveProperty('lastDebounceDelay');
    });
  });

  describe('disposal', () => {
    it('should clean up resources on dispose', async () => {
      // Start some pending requests
      const promise1 = manager.getCompletions(
        { ...mockContext, hash: 'req1' },
        mockCancellationToken
      );
      const promise2 = manager.getCompletions(
        { ...mockContext, hash: 'req2' },
        mockCancellationToken
      );

      manager.dispose();

      // Advance timers to see if any errors occur
      jest.advanceTimersByTime(1000);

      // Should not throw
      await expect(Promise.allSettled([promise1, promise2])).resolves.toBeDefined();
    });

    it('should clear debounce timer on dispose', () => {
      manager.getCompletions(mockContext, mockCancellationToken);

      expect(manager['debounceTimer']).toBeDefined();

      manager.dispose();

      expect(manager['debounceTimer']).toBeUndefined();
    });
  });
});
