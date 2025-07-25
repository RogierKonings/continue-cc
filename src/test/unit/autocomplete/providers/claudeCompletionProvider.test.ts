import { ClaudeCompletionProvider } from '../../../../autocomplete/providers/claudeCompletionProvider';

// Mock all dependencies
jest.mock('../../../../autocomplete/context/contextExtractor');
jest.mock('../../../../autocomplete/performance/debouncedCompletionManager');
jest.mock('../../../../autocomplete/cache/completionCache');
jest.mock('../../../../utils/logger');
jest.mock('../../../../autocomplete/modes/completionModeManager');
jest.mock('../../../../autocomplete/languages/multiLanguageProvider');

// Create mock classes
const mockContextExtractor = {
  extractContext: jest.fn(),
};

const mockDebouncedManager = {
  getCompletions: jest.fn(),
  getInlineCompletions: jest.fn(),
  dispose: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockModeManager = {
  provideCompletions: jest.fn(),
  dispose: jest.fn(),
};

const mockMultiLanguageProvider = {
  provideCompletions: jest.fn(),
};

// Mock the constructor dependencies
jest.mock('../../../../autocomplete/context/contextExtractor', () => ({
  ContextExtractor: jest.fn(() => mockContextExtractor),
}));

jest.mock('../../../../autocomplete/performance/debouncedCompletionManager', () => ({
  DebouncedCompletionManager: jest.fn(() => mockDebouncedManager),
}));

jest.mock('../../../../autocomplete/cache/completionCache', () => ({
  CompletionCache: jest.fn(() => mockCache),
}));

jest.mock('../../../../utils/logger', () => ({
  Logger: jest.fn(() => mockLogger),
}));

jest.mock('../../../../autocomplete/modes/completionModeManager', () => ({
  CompletionModeManager: jest.fn(() => mockModeManager),
}));

jest.mock('../../../../autocomplete/languages/multiLanguageProvider', () => ({
  MultiLanguageProvider: jest.fn(() => mockMultiLanguageProvider),
}));

// Mock vscode objects
const mockDocument = {
  languageId: 'typescript',
  getText: jest.fn(() => 'const x = 42;'),
  lineAt: jest.fn(() => ({ text: 'const x = 42;' })),
  uri: { toString: () => 'file:///test.ts' },
  version: 1,
};

const mockPosition = {
  line: 0,
  character: 10,
};

const mockCancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
};

const mockCompletionContext = {
  triggerKind: 1, // Invoke
  triggerCharacter: undefined,
};

const mockInlineCompletionContext = {
  triggerKind: 0, // Automatic
  selectedCompletionInfo: undefined,
};

describe('ClaudeCompletionProvider', () => {
  let provider: ClaudeCompletionProvider;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh provider instance
    provider = new ClaudeCompletionProvider();
  });

  afterEach(() => {
    provider.dispose();
  });

  describe('provideCompletionItems', () => {
    it('should return language completions if available', async () => {
      const mockLanguageCompletions = [
        { label: 'console', kind: 1 },
        { label: 'const', kind: 1 },
      ];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue(mockLanguageCompletions);
      mockModeManager.provideCompletions.mockResolvedValue([]);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual(mockLanguageCompletions);
      expect(mockMultiLanguageProvider.provideCompletions).toHaveBeenCalledWith(
        mockDocument,
        mockPosition,
        mockCompletionContext,
        mockCancellationToken
      );
    });

    it('should return mode completions if available', async () => {
      const mockModeCompletions = [
        { label: 'if', kind: 14 },
        { label: 'for', kind: 14 },
      ];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue([]);
      mockModeManager.provideCompletions.mockResolvedValue(mockModeCompletions);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual(mockModeCompletions);
      expect(mockModeManager.provideCompletions).toHaveBeenCalledWith(
        mockDocument,
        mockPosition,
        mockCompletionContext,
        mockCancellationToken,
        mockDebouncedManager
      );
    });

    it('should combine language and mode completions', async () => {
      const mockLanguageCompletions = [{ label: 'console', kind: 1 }];
      const mockModeCompletions = [{ label: 'if', kind: 14 }];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue(mockLanguageCompletions);
      mockModeManager.provideCompletions.mockResolvedValue(mockModeCompletions);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual([...mockLanguageCompletions, ...mockModeCompletions]);
    });

    it('should fall back to Claude completions when no local completions', async () => {
      const mockCodeContext = {
        language: 'typescript',
        prefix: 'const x = ',
        suffix: ';',
        currentLine: 'const x = 42;',
        imports: [],
        symbols: [],
      };

      const mockClaudeCompletions = [
        { label: '42', kind: 1 },
        { label: 'getValue()', kind: 2 },
      ];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue([]);
      mockModeManager.provideCompletions.mockResolvedValue([]);
      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockCache.get.mockReturnValue(null);
      mockDebouncedManager.getCompletions.mockResolvedValue(mockClaudeCompletions);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual(mockClaudeCompletions);
      expect(mockContextExtractor.extractContext).toHaveBeenCalledWith(mockDocument, mockPosition);
      expect(mockDebouncedManager.getCompletions).toHaveBeenCalledWith(
        mockCodeContext,
        mockCancellationToken
      );
      expect(mockCache.set).toHaveBeenCalledWith(mockCodeContext, mockClaudeCompletions);
    });

    it('should return cached completions when available', async () => {
      const mockCodeContext = {
        language: 'typescript',
        prefix: 'const x = ',
        suffix: ';',
        currentLine: 'const x = 42;',
        imports: [],
        symbols: [],
      };

      const mockCachedCompletions = [
        { label: 'cached1', kind: 1 },
        { label: 'cached2', kind: 1 },
      ];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue([]);
      mockModeManager.provideCompletions.mockResolvedValue([]);
      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockCache.get.mockReturnValue(mockCachedCompletions);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual(mockCachedCompletions);
      expect(mockDebouncedManager.getCompletions).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Returning cached completions');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error');

      mockMultiLanguageProvider.provideCompletions.mockRejectedValue(error);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('Error providing completions', error);
    });

    it('should not cache empty completions', async () => {
      const mockCodeContext = {
        language: 'typescript',
        prefix: 'const x = ',
        suffix: ';',
        currentLine: 'const x = 42;',
        imports: [],
        symbols: [],
      };

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue([]);
      mockModeManager.provideCompletions.mockResolvedValue([]);
      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockCache.get.mockReturnValue(null);
      mockDebouncedManager.getCompletions.mockResolvedValue([]);

      const result = await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(result).toEqual([]);
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('provideInlineCompletionItems', () => {
    it('should provide inline completions through debounced manager', async () => {
      const mockCodeContext = {
        language: 'typescript',
        prefix: 'const x = ',
        suffix: ';',
        currentLine: 'const x = 42;',
        imports: [],
        symbols: [],
      };

      const mockInlineCompletions = [
        { insertText: '42', range: {} },
        { insertText: 'getValue()', range: {} },
      ];

      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockDebouncedManager.getInlineCompletions.mockResolvedValue(mockInlineCompletions);

      const result = await provider.provideInlineCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockInlineCompletionContext as any,
        mockCancellationToken as any
      );

      expect(result).toEqual(mockInlineCompletions);
      expect(mockContextExtractor.extractContext).toHaveBeenCalledWith(mockDocument, mockPosition);
      expect(mockDebouncedManager.getInlineCompletions).toHaveBeenCalledWith(
        mockCodeContext,
        mockCancellationToken
      );
    });

    it('should handle inline completion errors gracefully', async () => {
      const error = new Error('Inline completion error');

      mockContextExtractor.extractContext.mockRejectedValue(error);

      const result = await provider.provideInlineCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockInlineCompletionContext as any,
        mockCancellationToken as any
      );

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('Error providing inline completions', error);
    });
  });

  describe('getModeManager', () => {
    it('should return the mode manager instance', () => {
      const result = provider.getModeManager();
      expect(result).toBe(mockModeManager);
    });
  });

  describe('dispose', () => {
    it('should dispose all dependencies', () => {
      provider.dispose();

      expect(mockDebouncedManager.dispose).toHaveBeenCalled();
      expect(mockCache.clear).toHaveBeenCalled();
      expect(mockModeManager.dispose).toHaveBeenCalled();
    });
  });

  describe('performance logging', () => {
    it('should log completion latency for local completions', async () => {
      const mockLanguageCompletions = [{ label: 'console', kind: 1 }];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue(mockLanguageCompletions);
      mockModeManager.provideCompletions.mockResolvedValue([]);

      await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Local completion request took \d+\.\d+ms/)
      );
    });

    it('should log completion latency for Claude completions', async () => {
      const mockCodeContext = { language: 'typescript' };
      const mockClaudeCompletions = [{ label: '42', kind: 1 }];

      mockMultiLanguageProvider.provideCompletions.mockResolvedValue([]);
      mockModeManager.provideCompletions.mockResolvedValue([]);
      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockCache.get.mockReturnValue(null);
      mockDebouncedManager.getCompletions.mockResolvedValue(mockClaudeCompletions);

      await provider.provideCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockCancellationToken as any,
        mockCompletionContext as any
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Completion request took \d+\.\d+ms/)
      );
    });

    it('should log inline completion latency', async () => {
      const mockCodeContext = { language: 'typescript' };
      const mockInlineCompletions = [{ insertText: '42' }];

      mockContextExtractor.extractContext.mockResolvedValue(mockCodeContext);
      mockDebouncedManager.getInlineCompletions.mockResolvedValue(mockInlineCompletions);

      await provider.provideInlineCompletionItems(
        mockDocument as any,
        mockPosition as any,
        mockInlineCompletionContext as any,
        mockCancellationToken as any
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Inline completion request took \d+\.\d+ms/)
      );
    });
  });
});
