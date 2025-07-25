import * as vscode from 'vscode';
import * as path from 'path';

export interface LanguageInfo {
  id: string;
  name: string;
  extensions: string[];
  aliases: string[];
  mimeTypes?: string[];
  firstLine?: RegExp;
  framework?: string;
}

export class LanguageDetector {
  private static readonly LANGUAGE_MAP: Record<string, LanguageInfo> = {
    javascript: {
      id: 'javascript',
      name: 'JavaScript',
      extensions: ['.js', '.mjs', '.cjs'],
      aliases: ['js', 'node'],
      mimeTypes: ['text/javascript', 'application/javascript'],
      firstLine: /^#!.*\b(node|js)\b/,
    },
    typescript: {
      id: 'typescript',
      name: 'TypeScript',
      extensions: ['.ts', '.mts', '.cts'],
      aliases: ['ts'],
      mimeTypes: ['text/typescript', 'application/typescript'],
    },
    javascriptreact: {
      id: 'javascriptreact',
      name: 'JavaScript React',
      extensions: ['.jsx'],
      aliases: ['jsx'],
      mimeTypes: ['text/jsx'],
    },
    typescriptreact: {
      id: 'typescriptreact',
      name: 'TypeScript React',
      extensions: ['.tsx'],
      aliases: ['tsx'],
      mimeTypes: ['text/tsx'],
    },
    python: {
      id: 'python',
      name: 'Python',
      extensions: ['.py', '.pyw', '.pyi'],
      aliases: ['py'],
      mimeTypes: ['text/x-python', 'application/x-python'],
      firstLine: /^#!.*\bpython[0-9.]*\b/,
    },
    java: {
      id: 'java',
      name: 'Java',
      extensions: ['.java'],
      aliases: [],
      mimeTypes: ['text/x-java', 'application/x-java'],
    },
    cpp: {
      id: 'cpp',
      name: 'C++',
      extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h++'],
      aliases: ['c++', 'cplusplus'],
      mimeTypes: ['text/x-c++src', 'text/x-c++hdr'],
    },
    c: {
      id: 'c',
      name: 'C',
      extensions: ['.c', '.h'],
      aliases: [],
      mimeTypes: ['text/x-csrc', 'text/x-chdr'],
    },
    go: {
      id: 'go',
      name: 'Go',
      extensions: ['.go'],
      aliases: ['golang'],
      mimeTypes: ['text/x-go'],
    },
    rust: {
      id: 'rust',
      name: 'Rust',
      extensions: ['.rs'],
      aliases: ['rs'],
      mimeTypes: ['text/x-rust'],
    },
    ruby: {
      id: 'ruby',
      name: 'Ruby',
      extensions: ['.rb', '.rbw'],
      aliases: ['rb'],
      mimeTypes: ['text/x-ruby'],
      firstLine: /^#!.*\bruby\b/,
    },
    php: {
      id: 'php',
      name: 'PHP',
      extensions: ['.php', '.php3', '.php4', '.php5', '.phtml'],
      aliases: [],
      mimeTypes: ['text/x-php', 'application/x-php'],
      firstLine: /^<\?php/,
    },
    csharp: {
      id: 'csharp',
      name: 'C#',
      extensions: ['.cs'],
      aliases: ['c#', 'cs'],
      mimeTypes: ['text/x-csharp'],
    },
    swift: {
      id: 'swift',
      name: 'Swift',
      extensions: ['.swift'],
      aliases: [],
      mimeTypes: ['text/x-swift'],
    },
  };

  /**
   * Detect language from file extension
   */
  static detectFromExtension(filePath: string): LanguageInfo | null {
    const ext = path.extname(filePath).toLowerCase();

    for (const lang of Object.values(this.LANGUAGE_MAP)) {
      if (lang.extensions.includes(ext)) {
        return lang;
      }
    }

    return null;
  }

  /**
   * Detect language from shebang line
   */
  static detectFromShebang(firstLine: string): LanguageInfo | null {
    const trimmedLine = firstLine.trim();

    for (const lang of Object.values(this.LANGUAGE_MAP)) {
      if (lang.firstLine && lang.firstLine.test(trimmedLine)) {
        return lang;
      }
    }

    return null;
  }

  /**
   * Detect language from VSCode language ID
   */
  static detectFromLanguageId(languageId: string): LanguageInfo | null {
    return this.LANGUAGE_MAP[languageId] || null;
  }

  /**
   * Detect embedded languages (e.g., JSX in JS files)
   */
  static detectEmbeddedLanguages(
    document: vscode.TextDocument
  ): { primary: LanguageInfo; embedded: LanguageInfo[] } | null {
    const primary = this.detectFromLanguageId(document.languageId);
    if (!primary) {
      return null;
    }

    const embedded: LanguageInfo[] = [];
    const content = document.getText();

    // Detect JSX/TSX
    if (primary.id === 'javascript' || primary.id === 'typescript') {
      if (/<[A-Z]\w*/.test(content) || /<\/\w+>/.test(content)) {
        const reactLang =
          primary.id === 'javascript'
            ? this.LANGUAGE_MAP.javascriptreact
            : this.LANGUAGE_MAP.typescriptreact;
        if (reactLang) {
          embedded.push(reactLang);
        }
      }
    }

    // Detect template languages in HTML
    if (primary.id === 'html') {
      // Check for Vue templates
      if (/<template/.test(content) && /<script/.test(content)) {
        const vue = { ...primary, framework: 'vue' };
        embedded.push(vue);
      }

      // Check for Angular templates
      if (/\*ngFor|\*ngIf|\[(ngModel)\]/.test(content)) {
        const angular = { ...primary, framework: 'angular' };
        embedded.push(angular);
      }
    }

    // Detect SQL in string literals
    if (/['"`]SELECT\s+.*FROM\s+/i.test(content)) {
      embedded.push({
        id: 'sql',
        name: 'SQL',
        extensions: ['.sql'],
        aliases: [],
        mimeTypes: ['text/x-sql'],
      });
    }

    return { primary, embedded };
  }

  /**
   * Get all supported languages
   */
  static getSupportedLanguages(): LanguageInfo[] {
    return Object.values(this.LANGUAGE_MAP);
  }

  /**
   * Check if a language is supported
   */
  static isLanguageSupported(languageId: string): boolean {
    return languageId in this.LANGUAGE_MAP;
  }

  /**
   * Get language configuration
   */
  static getLanguageConfig(languageId: string): LanguageInfo | null {
    return this.LANGUAGE_MAP[languageId] || null;
  }
}
