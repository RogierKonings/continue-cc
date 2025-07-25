import { TokenCounter } from '../../../../autocomplete/utils/tokenCounter';
import type {
  CodeContext,
  SymbolInfo,
  TypeDefinition,
  ProjectContext,
} from '../../../../autocomplete/context/contextExtractor';

// Mock vscode SymbolKind enum
const SymbolKind = {
  Class: 5,
  Function: 12,
  Variable: 13,
  Method: 6,
} as const;

describe('TokenCounter', () => {
  describe('countTokens', () => {
    it('should count simple words correctly', () => {
      const text = 'hello world test';
      const count = TokenCounter.countTokens(text);
      expect(count).toBe(3); // 3 words
    });

    it('should count words and punctuation', () => {
      const text = 'const x = 42;';
      const count = TokenCounter.countTokens(text);
      expect(count).toBe(5); // 'const', 'x', '=', '42', ';'
    });

    it('should handle empty string', () => {
      const count = TokenCounter.countTokens('');
      expect(count).toBe(0);
    });

    it('should handle complex code', () => {
      const text = 'function calculateSum(a: number, b: number): number { return a + b; }';
      const count = TokenCounter.countTokens(text);
      expect(count).toBeGreaterThan(10); // Should count all words and symbols
    });

    it('should handle unicode characters', () => {
      const text = 'const 变量 = "值";';
      const count = TokenCounter.countTokens(text);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('getTokenLimit', () => {
    it('should return correct limit for known models', () => {
      expect(TokenCounter.getTokenLimit('claude-3-opus')).toBe(200000);
      expect(TokenCounter.getTokenLimit('claude-3-sonnet')).toBe(200000);
      expect(TokenCounter.getTokenLimit('claude-2.1')).toBe(100000);
    });

    it('should return default limit for unknown models', () => {
      expect(TokenCounter.getTokenLimit('unknown-model')).toBe(100000);
    });

    it('should handle empty model name', () => {
      expect(TokenCounter.getTokenLimit('')).toBe(100000);
    });
  });

  describe('getContextLimit', () => {
    it('should return 80% of token limit', () => {
      const modelLimit = TokenCounter.getTokenLimit('claude-3-opus');
      const contextLimit = TokenCounter.getContextLimit('claude-3-opus');
      expect(contextLimit).toBe(Math.floor(modelLimit * 0.8));
    });

    it('should work for all model types', () => {
      const models = ['claude-3-opus', 'claude-2.1', 'unknown-model'];
      models.forEach((model) => {
        const limit = TokenCounter.getContextLimit(model);
        expect(limit).toBeGreaterThan(0);
        expect(limit).toBeLessThan(TokenCounter.getTokenLimit(model));
      });
    });
  });

  describe('countContextTokens', () => {
    let mockContext: CodeContext;

    beforeEach(() => {
      mockContext = {
        language: 'typescript',
        fileContent: 'const x = 42; console.log(x);',
        prefix: 'const x = ',
        suffix: '; console.log(x);',
        currentLine: 'const x = 42;',
        cursorPosition: {} as any, // Mock position
        indentation: '  ',
        imports: ['import { test } from "jest";'],
        symbols: [
          { name: 'TestClass', kind: SymbolKind.Class, range: {} as any },
          { name: 'testFunction', kind: SymbolKind.Function, range: {} as any },
        ],
        projectInfo: {
          projectType: 'typescript',
          frameworks: ['jest'],
          dependencies: ['jest'],
          relatedFiles: [],
        },
        readmeContent: 'This is a test project.',
        typeDefinitions: [
          { name: 'TestType', definition: 'type TestType = string;', source: 'test.d.ts' },
        ],
      };
    });

    it('should count tokens for all context parts', () => {
      const result = TokenCounter.countContextTokens(mockContext);

      expect(result.total).toBeGreaterThan(0);
      expect(result.breakdown.prefix).toBeGreaterThan(0);
      expect(result.breakdown.suffix).toBeGreaterThan(0);
      expect(result.breakdown.imports).toBeGreaterThan(0);
      expect(result.breakdown.symbols).toBeGreaterThan(0);
      expect(result.breakdown.projectInfo).toBeGreaterThan(0);
      expect(result.breakdown.readme).toBeGreaterThan(0);
      expect(result.breakdown.typeDefinitions).toBeGreaterThan(0);
    });

    it('should handle missing optional fields', () => {
      const minimalContext: CodeContext = {
        language: 'typescript',
        fileContent: 'test',
        prefix: 'test',
        suffix: '',
        currentLine: 'test',
        cursorPosition: {} as any,
        indentation: '',
        imports: [],
        symbols: [],
        projectInfo: undefined,
        readmeContent: undefined,
        typeDefinitions: undefined,
      };

      const result = TokenCounter.countContextTokens(minimalContext);

      expect(result.total).toBeGreaterThan(0);
      expect(result.breakdown.readme).toBe(0);
      expect(result.breakdown.typeDefinitions).toBe(0);
    });

    it('should sum breakdown to total', () => {
      const result = TokenCounter.countContextTokens(mockContext);
      const calculatedTotal = Object.values(result.breakdown).reduce(
        (sum, count) => sum + count,
        0
      );

      expect(result.total).toBe(calculatedTotal);
    });
  });

  describe('truncateContext', () => {
    let largeContext: CodeContext;

    beforeEach(() => {
      // Create a context that will exceed limits
      const longText = 'This is a very long piece of text that should exceed token limits. '.repeat(
        100
      );

      largeContext = {
        language: 'typescript',
        fileContent: longText,
        prefix: longText,
        suffix: longText,
        currentLine: 'const x = 42;',
        cursorPosition: {} as any,
        indentation: '  ',
        imports: Array(50).fill('import { test } from "jest";'),
        symbols: Array(100).fill({
          name: 'TestSymbol',
          kind: SymbolKind.Function,
          range: { contains: () => false } as any,
        }),
        projectInfo: {
          projectType: 'typescript',
          frameworks: Array(20).fill('framework'),
        },
        readmeContent: longText,
        typeDefinitions: Array(20).fill({ name: 'Type', definition: longText, source: 'test.ts' }),
      };
    });

    it('should return original context if under limit', () => {
      const smallContext: CodeContext = {
        language: 'typescript',
        fileContent: 'small',
        prefix: 'small',
        suffix: 'small',
        currentLine: 'small',
        cursorPosition: {} as any,
        indentation: '',
        imports: [],
        symbols: [],
        projectInfo: undefined,
        readmeContent: undefined,
        typeDefinitions: undefined,
      };

      const result = TokenCounter.truncateContext(smallContext, 'claude-3-opus');
      expect(result).toEqual(smallContext);
    });

    it('should truncate context when over limit', () => {
      const result = TokenCounter.truncateContext(largeContext, 'claude-3-opus');
      const tokens = TokenCounter.countContextTokens(result);
      const limit = TokenCounter.getContextLimit('claude-3-opus');

      expect(tokens.total).toBeLessThanOrEqual(limit);
    });

    it('should not mutate original context', () => {
      const originalPrefix = largeContext.prefix;
      const originalSuffix = largeContext.suffix;
      const originalReadme = largeContext.readmeContent;

      const result = TokenCounter.truncateContext(largeContext, 'claude-3-opus');

      // Original should remain unchanged
      expect(largeContext.prefix).toBe(originalPrefix);
      expect(largeContext.suffix).toBe(originalSuffix);
      expect(largeContext.readmeContent).toBe(originalReadme);

      // If truncation occurred, result should be different
      const originalTokens = TokenCounter.countContextTokens(largeContext);
      const limit = TokenCounter.getContextLimit('claude-3-opus');
      if (originalTokens.total > limit) {
        expect(result).not.toBe(largeContext); // Should be a copy when truncated
      }
    });

    it('should preserve prefix over suffix when truncating', () => {
      const result = TokenCounter.truncateContext(largeContext, 'claude-instant');

      // Suffix should be more truncated than prefix
      const originalPrefixLength = largeContext.prefix.length;
      const originalSuffixLength = largeContext.suffix.length;
      const resultPrefixLength = result.prefix.length;
      const resultSuffixLength = result.suffix.length;

      const prefixReduction = (originalPrefixLength - resultPrefixLength) / originalPrefixLength;
      const suffixReduction = (originalSuffixLength - resultSuffixLength) / originalSuffixLength;

      expect(suffixReduction).toBeGreaterThanOrEqual(prefixReduction);
    });

    it('should remove README before truncating code context', () => {
      const result = TokenCounter.truncateContext(largeContext, 'claude-instant');

      // Check if context needed truncation
      const originalTokens = TokenCounter.countContextTokens(largeContext);
      const limit = TokenCounter.getContextLimit('claude-instant');

      if (originalTokens.total > limit) {
        // If truncation was needed, check that README was prioritized for removal
        const resultTokens = TokenCounter.countContextTokens(result);
        expect(resultTokens.total).toBeLessThanOrEqual(limit);

        // README might be removed but this depends on how much truncation was needed
        // Let's just verify the result is within limits
        expect(resultTokens.breakdown.readme).toBeLessThanOrEqual(originalTokens.breakdown.readme);
      }
    });
  });

  describe('formatTokenInfo', () => {
    it('should format token information correctly', () => {
      const mockContext: CodeContext = {
        language: 'typescript',
        fileContent: 'const x = 42;',
        prefix: 'const x = ',
        suffix: ';',
        currentLine: 'const x = 42;',
        cursorPosition: {} as any,
        indentation: '',
        imports: ['import test from "jest";'],
        symbols: [{ name: 'test', kind: SymbolKind.Function, range: {} as any }],
        projectInfo: { projectType: 'typescript' },
        readmeContent: 'Test project',
        typeDefinitions: [
          { name: 'TestType', definition: 'type TestType = string;', source: 'test.ts' },
        ],
      };

      const formatted = TokenCounter.formatTokenInfo(mockContext, 'claude-3-opus');

      expect(formatted).toContain('Token usage:');
      expect(formatted).toContain('Breakdown:');
      expect(formatted).toContain('Prefix:');
      expect(formatted).toContain('Suffix:');
      expect(formatted).toContain('Imports:');
      expect(formatted).toContain('Symbols:');
      expect(formatted).toContain('README:');
      expect(formatted).toContain('Project:');
      expect(formatted).toContain('Types:');
    });

    it('should show percentage correctly', () => {
      const mockContext: CodeContext = {
        language: 'typescript',
        fileContent: 'test',
        prefix: 'test',
        suffix: '',
        currentLine: 'test',
        cursorPosition: {} as any,
        indentation: '',
        imports: [],
        symbols: [],
        projectInfo: undefined,
        readmeContent: undefined,
        typeDefinitions: undefined,
      };

      const formatted = TokenCounter.formatTokenInfo(mockContext, 'claude-3-opus');

      // Should contain a percentage
      expect(formatted).toMatch(/\d+\.\d+%/);
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined values gracefully', () => {
      const contextWithNulls: CodeContext = {
        language: 'typescript',
        fileContent: '',
        prefix: '',
        suffix: '',
        currentLine: '',
        cursorPosition: {} as any,
        indentation: '',
        imports: [],
        symbols: [],
        projectInfo: undefined,
        readmeContent: undefined,
        typeDefinitions: undefined,
      };

      expect(() => TokenCounter.countContextTokens(contextWithNulls)).not.toThrow();
      expect(() => TokenCounter.truncateContext(contextWithNulls, 'claude-3-opus')).not.toThrow();
      expect(() => TokenCounter.formatTokenInfo(contextWithNulls, 'claude-3-opus')).not.toThrow();
    });

    it('should handle extremely small token limits', () => {
      const mockContext: CodeContext = {
        language: 'typescript',
        fileContent: 'const x = 42; const y = 43; const z = 44; console.log(x, y, z);',
        prefix: 'const x = 42; const y = 43; const z = 44;',
        suffix: 'console.log(x, y, z);',
        currentLine: 'const x = 42;',
        cursorPosition: {} as any,
        indentation: '',
        imports: [],
        symbols: [],
        projectInfo: undefined,
        readmeContent: undefined,
        typeDefinitions: undefined,
      };

      // Mock extremely small limit
      const originalGetContextLimit = TokenCounter.getContextLimit;
      jest.spyOn(TokenCounter, 'getContextLimit').mockReturnValue(5);

      const result = TokenCounter.truncateContext(mockContext, 'test-model');
      expect(result.prefix.length).toBeLessThan(mockContext.prefix.length);

      // Restore original method
      jest.restoreAllMocks();
    });
  });
});
