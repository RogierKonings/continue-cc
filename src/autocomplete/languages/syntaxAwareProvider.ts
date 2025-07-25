import * as vscode from 'vscode';
import { LanguageDetector, LanguageInfo } from './languageDetector';
import { LanguagePromptTemplate } from './languagePromptTemplate';
import { CompletionMode } from '../modes/completionModes';

export interface SyntaxRules {
  keywords: string[];
  reservedWords: string[];
  namingConventions: {
    variables: 'camelCase' | 'snake_case' | 'PascalCase';
    functions: 'camelCase' | 'snake_case' | 'PascalCase';
    classes: 'PascalCase' | 'snake_case';
    constants: 'UPPER_SNAKE_CASE' | 'PascalCase';
  };
  indentation: {
    type: 'spaces' | 'tabs';
    size: number;
  };
  statementTerminator: string;
  commentStyle: {
    single: string;
    multi: { start: string; end: string };
  };
}

export class SyntaxAwareProvider {
  private static readonly SYNTAX_RULES: Record<string, SyntaxRules> = {
    javascript: {
      keywords: [
        'function',
        'class',
        'const',
        'let',
        'var',
        'if',
        'else',
        'for',
        'while',
        'return',
        'async',
        'await',
      ],
      reservedWords: [
        'break',
        'case',
        'catch',
        'continue',
        'debugger',
        'default',
        'delete',
        'do',
        'finally',
        'in',
        'instanceof',
        'new',
        'switch',
        'this',
        'throw',
        'try',
        'typeof',
        'void',
        'with',
      ],
      namingConventions: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      indentation: { type: 'spaces', size: 2 },
      statementTerminator: ';',
      commentStyle: {
        single: '//',
        multi: { start: '/*', end: '*/' },
      },
    },
    typescript: {
      keywords: [
        'function',
        'class',
        'const',
        'let',
        'var',
        'if',
        'else',
        'for',
        'while',
        'return',
        'async',
        'await',
        'interface',
        'type',
        'enum',
        'namespace',
        'module',
        'declare',
        'abstract',
      ],
      reservedWords: [
        'break',
        'case',
        'catch',
        'continue',
        'debugger',
        'default',
        'delete',
        'do',
        'finally',
        'in',
        'instanceof',
        'new',
        'switch',
        'this',
        'throw',
        'try',
        'typeof',
        'void',
        'with',
        'as',
        'implements',
        'package',
        'private',
        'protected',
        'public',
        'static',
      ],
      namingConventions: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      indentation: { type: 'spaces', size: 2 },
      statementTerminator: ';',
      commentStyle: {
        single: '//',
        multi: { start: '/*', end: '*/' },
      },
    },
    python: {
      keywords: [
        'def',
        'class',
        'if',
        'elif',
        'else',
        'for',
        'while',
        'return',
        'async',
        'await',
        'import',
        'from',
        'as',
        'try',
        'except',
        'finally',
        'raise',
        'with',
        'yield',
        'lambda',
      ],
      reservedWords: [
        'False',
        'None',
        'True',
        'and',
        'assert',
        'break',
        'continue',
        'del',
        'global',
        'in',
        'is',
        'nonlocal',
        'not',
        'or',
        'pass',
      ],
      namingConventions: {
        variables: 'snake_case',
        functions: 'snake_case',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      indentation: { type: 'spaces', size: 4 },
      statementTerminator: '',
      commentStyle: {
        single: '#',
        multi: { start: '"""', end: '"""' },
      },
    },
    java: {
      keywords: [
        'class',
        'interface',
        'enum',
        'public',
        'private',
        'protected',
        'static',
        'final',
        'abstract',
        'if',
        'else',
        'for',
        'while',
        'return',
        'try',
        'catch',
        'finally',
        'throw',
        'throws',
        'new',
        'extends',
        'implements',
      ],
      reservedWords: [
        'boolean',
        'byte',
        'char',
        'double',
        'float',
        'int',
        'long',
        'short',
        'void',
        'assert',
        'break',
        'case',
        'continue',
        'default',
        'do',
        'import',
        'instanceof',
        'native',
        'package',
        'super',
        'switch',
        'synchronized',
        'this',
        'transient',
        'volatile',
      ],
      namingConventions: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      indentation: { type: 'spaces', size: 4 },
      statementTerminator: ';',
      commentStyle: {
        single: '//',
        multi: { start: '/*', end: '*/' },
      },
    },
    go: {
      keywords: [
        'func',
        'type',
        'struct',
        'interface',
        'if',
        'else',
        'for',
        'range',
        'return',
        'defer',
        'go',
        'select',
        'case',
        'switch',
        'break',
        'continue',
        'fallthrough',
      ],
      reservedWords: [
        'var',
        'const',
        'package',
        'import',
        'map',
        'chan',
        'make',
        'new',
        'nil',
        'true',
        'false',
      ],
      namingConventions: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'PascalCase',
      },
      indentation: { type: 'tabs', size: 1 },
      statementTerminator: '',
      commentStyle: {
        single: '//',
        multi: { start: '/*', end: '*/' },
      },
    },
    rust: {
      keywords: [
        'fn',
        'struct',
        'enum',
        'trait',
        'impl',
        'if',
        'else',
        'match',
        'for',
        'while',
        'loop',
        'return',
        'let',
        'mut',
        'const',
        'static',
        'use',
        'mod',
        'pub',
        'async',
        'await',
      ],
      reservedWords: [
        'as',
        'break',
        'continue',
        'crate',
        'extern',
        'false',
        'in',
        'move',
        'ref',
        'self',
        'Self',
        'super',
        'true',
        'type',
        'unsafe',
        'where',
      ],
      namingConventions: {
        variables: 'snake_case',
        functions: 'snake_case',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
      },
      indentation: { type: 'spaces', size: 4 },
      statementTerminator: ';',
      commentStyle: {
        single: '//',
        multi: { start: '/*', end: '*/' },
      },
    },
  };

  /**
   * Get syntax rules for a language
   */
  static getSyntaxRules(languageId: string): SyntaxRules | null {
    return this.SYNTAX_RULES[languageId] || null;
  }

  /**
   * Check if a word is a keyword or reserved word
   */
  static isReservedWord(word: string, languageId: string): boolean {
    const rules = this.getSyntaxRules(languageId);
    if (!rules) return false;

    return rules.keywords.includes(word) || rules.reservedWords.includes(word);
  }

  /**
   * Apply naming convention to an identifier
   */
  static applyNamingConvention(
    identifier: string,
    type: 'variables' | 'functions' | 'classes' | 'constants',
    languageId: string
  ): string {
    const rules = this.getSyntaxRules(languageId);
    if (!rules) return identifier;

    const convention = rules.namingConventions[type];

    switch (convention) {
      case 'camelCase':
        return this.toCamelCase(identifier);
      case 'snake_case':
        return this.toSnakeCase(identifier);
      case 'PascalCase':
        return this.toPascalCase(identifier);
      case 'UPPER_SNAKE_CASE':
        return this.toUpperSnakeCase(identifier);
      default:
        return identifier;
    }
  }

  /**
   * Get appropriate indentation for a language
   */
  static getIndentation(languageId: string, level: number = 1): string {
    const rules = this.getSyntaxRules(languageId);
    if (!rules) return '  '; // Default to 2 spaces

    const char = rules.indentation.type === 'tabs' ? '\t' : ' ';
    const size = rules.indentation.type === 'tabs' ? 1 : rules.indentation.size;

    return char.repeat(size * level);
  }

  /**
   * Format imports for a language
   */
  static formatImport(
    module: string,
    imports: string[],
    languageId: string,
    alias?: string
  ): string {
    switch (languageId) {
      case 'javascript':
      case 'typescript':
        if (imports.length === 0) {
          return `import '${module}'`;
        } else if (imports.length === 1 && imports[0] === 'default') {
          return `import ${alias || 'module'} from '${module}'`;
        } else {
          return `import { ${imports.join(', ')} } from '${module}'`;
        }

      case 'python':
        if (imports.length === 0) {
          return `import ${module}`;
        } else {
          return `from ${module} import ${imports.join(', ')}`;
        }

      case 'java':
        return `import ${module}${imports.length > 0 ? '.' + imports[0] : '.*'};`;

      case 'go':
        if (alias) {
          return `import ${alias} "${module}"`;
        }
        return `import "${module}"`;

      case 'rust':
        if (imports.length === 0) {
          return `use ${module};`;
        }
        return `use ${module}::{${imports.join(', ')}};`;

      default:
        return `import ${module}`;
    }
  }

  /**
   * Generate appropriate completion based on syntax rules
   */
  static generateSyntaxAwareCompletion(context: {
    languageId: string;
    mode: CompletionMode;
    prefix: string;
    suffix: string;
    indentLevel: number;
  }): vscode.CompletionItem[] {
    const rules = this.getSyntaxRules(context.languageId);
    if (!rules) return [];

    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(context.languageId, context.indentLevel);

    // Don't suggest keywords that are already present
    const lastWord = context.prefix.match(/\b(\w+)$/)?.[1] || '';

    // Filter out reserved words from suggestions
    if (!this.isReservedWord(lastWord, context.languageId)) {
      // Add language-specific suggestions based on context
      if (context.mode === CompletionMode.LINE) {
        completions.push(...this.getLineSuggestions(context, rules, indent));
      }
    }

    return completions;
  }

  private static getLineSuggestions(
    context: any,
    rules: SyntaxRules,
    indent: string
  ): vscode.CompletionItem[] {
    const suggestions: vscode.CompletionItem[] = [];

    // Add statement terminator if needed
    if (rules.statementTerminator && !context.suffix.trim().startsWith(rules.statementTerminator)) {
      const item = new vscode.CompletionItem(
        rules.statementTerminator,
        vscode.CompletionItemKind.Text
      );
      item.detail = 'Add statement terminator';
      item.sortText = '0';
      suggestions.push(item);
    }

    return suggestions;
  }

  // Naming convention helpers
  private static toCamelCase(str: string): string {
    return str
      .replace(/[_-](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toLowerCase());
  }

  private static toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/[-\s]+/g, '_');
  }

  private static toPascalCase(str: string): string {
    return str
      .replace(/[_-](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toUpperCase());
  }

  private static toUpperSnakeCase(str: string): string {
    return this.toSnakeCase(str).toUpperCase();
  }
}
