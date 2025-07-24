import type { CodeContext, SymbolInfo } from '../context/contextExtractor';
import * as vscode from 'vscode';

interface CompressionOptions {
  removeComments?: boolean;
  removeEmptyLines?: boolean;
  minifyWhitespace?: boolean;
  deduplicateImports?: boolean;
  summarizeSymbols?: boolean;
  abbreviateTypes?: boolean;
}

export class ContextCompressor {
  private static readonly DEFAULT_OPTIONS: CompressionOptions = {
    removeComments: true,
    removeEmptyLines: true,
    minifyWhitespace: true,
    deduplicateImports: true,
    summarizeSymbols: true,
    abbreviateTypes: true,
  };

  static compressContext(
    context: CodeContext,
    options: CompressionOptions = this.DEFAULT_OPTIONS
  ): CodeContext {
    const compressed = { ...context };

    // Compress prefix and suffix
    if (options.removeComments || options.removeEmptyLines || options.minifyWhitespace) {
      compressed.prefix = this.compressCode(compressed.prefix, context.language, options);
      compressed.suffix = this.compressCode(compressed.suffix, context.language, options);
      compressed.fileContent = this.compressCode(compressed.fileContent, context.language, options);
    }

    // Deduplicate imports
    if (options.deduplicateImports && compressed.imports) {
      compressed.imports = [...new Set(compressed.imports)];
    }

    // Summarize symbols
    if (options.summarizeSymbols && compressed.symbols) {
      compressed.symbols = this.summarizeSymbols(compressed.symbols);
    }

    // Compress type definitions
    if (options.abbreviateTypes && compressed.typeDefinitions) {
      compressed.typeDefinitions = compressed.typeDefinitions.map((td) => ({
        ...td,
        definition: this.abbreviateTypeDefinition(td.definition),
      }));
    }

    // Compress README content more aggressively
    if (compressed.readmeContent) {
      compressed.readmeContent = this.compressReadme(compressed.readmeContent);
    }

    return compressed;
  }

  private static compressCode(code: string, language: string, options: CompressionOptions): string {
    let compressed = code;

    // Remove comments based on language
    if (options.removeComments) {
      compressed = this.removeComments(compressed, language);
    }

    // Remove empty lines
    if (options.removeEmptyLines) {
      compressed = compressed
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .join('\n');
    }

    // Minify whitespace
    if (options.minifyWhitespace) {
      // Replace multiple spaces with single space
      compressed = compressed.replace(/[ \t]+/g, ' ');
      // Remove trailing whitespace
      compressed = compressed.replace(/[ \t]+$/gm, '');
      // Reduce multiple newlines to maximum of 2
      compressed = compressed.replace(/\n{3,}/g, '\n\n');
    }

    return compressed;
  }

  private static removeComments(code: string, language: string): string {
    switch (language) {
      case 'javascript':
      case 'typescript':
      case 'javascriptreact':
      case 'typescriptreact':
      case 'java':
      case 'c':
      case 'cpp':
      case 'csharp':
      case 'go':
      case 'rust':
        // Remove single-line comments
        code = code.replace(/\/\/.*$/gm, '');
        // Remove multi-line comments
        code = code.replace(/\/\*[\s\S]*?\*\//g, '');
        break;

      case 'python':
        // Remove single-line comments
        code = code.replace(/#.*$/gm, '');
        // Remove docstrings (simple approach)
        code = code.replace(/"""[\s\S]*?"""/g, '');
        code = code.replace(/'''[\s\S]*?'''/g, '');
        break;

      case 'ruby':
        // Remove single-line comments
        code = code.replace(/#.*$/gm, '');
        // Remove multi-line comments
        code = code.replace(/=begin[\s\S]*?=end/g, '');
        break;

      case 'html':
      case 'xml':
        // Remove HTML/XML comments
        code = code.replace(/<!--[\s\S]*?-->/g, '');
        break;

      case 'css':
      case 'scss':
      case 'less':
        // Remove CSS comments
        code = code.replace(/\/\*[\s\S]*?\*\//g, '');
        break;
    }

    return code;
  }

  private static summarizeSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
    // Group symbols by kind
    const symbolsByKind = new Map<vscode.SymbolKind, SymbolInfo[]>();

    for (const symbol of symbols) {
      const existing = symbolsByKind.get(symbol.kind) || [];
      existing.push(symbol);
      symbolsByKind.set(symbol.kind, existing);
    }

    // Keep only important symbol kinds and limit count
    const importantKinds = [
      vscode.SymbolKind.Class,
      vscode.SymbolKind.Interface,
      vscode.SymbolKind.Function,
      vscode.SymbolKind.Method,
      vscode.SymbolKind.Constructor,
      vscode.SymbolKind.Enum,
    ];

    const summarized: SymbolInfo[] = [];

    for (const kind of importantKinds) {
      const symbolsOfKind = symbolsByKind.get(kind) || [];
      // Keep up to 5 symbols of each important kind
      summarized.push(...symbolsOfKind.slice(0, 5));
    }

    return summarized;
  }

  private static abbreviateTypeDefinition(definition: string): string {
    // Remove excessive whitespace
    let abbreviated = definition.replace(/\s+/g, ' ').trim();

    // Shorten common type patterns
    abbreviated = abbreviated.replace(/Array<([^>]+)>/g, '$1[]');
    abbreviated = abbreviated.replace(/Promise<([^>]+)>/g, 'P<$1>');
    abbreviated = abbreviated.replace(/Record<([^,]+),\s*([^>]+)>/g, '{[$1]:$2}');

    // Remove optional parameters in function types
    abbreviated = abbreviated.replace(/\?:/g, ':');

    // Limit length
    if (abbreviated.length > 200) {
      abbreviated = abbreviated.substring(0, 197) + '...';
    }

    return abbreviated;
  }

  private static compressReadme(readme: string): string {
    // Extract only the first paragraph and key sections
    const lines = readme.split('\n');
    const compressed: string[] = [];
    let inImportantSection = false;
    let linesAdded = 0;
    const maxLines = 20;

    const importantHeaders = [
      /^#\s+/, // Main title
      /^##\s+overview/i,
      /^##\s+description/i,
      /^##\s+features/i,
      /^##\s+usage/i,
      /^##\s+api/i,
    ];

    for (const line of lines) {
      if (linesAdded >= maxLines) break;

      // Check if this is an important header
      const isImportantHeader = importantHeaders.some((pattern) => pattern.test(line));

      if (isImportantHeader) {
        inImportantSection = true;
        compressed.push(line);
        linesAdded++;
      } else if (inImportantSection && line.trim()) {
        // Include content under important sections
        compressed.push(line);
        linesAdded++;
      } else if (line.startsWith('#')) {
        // New section that's not important
        inImportantSection = false;
      }
    }

    return compressed.join('\n');
  }

  static getCompressionRatio(original: CodeContext, compressed: CodeContext): number {
    const originalSize = JSON.stringify(original).length;
    const compressedSize = JSON.stringify(compressed).length;

    return ((originalSize - compressedSize) / originalSize) * 100;
  }
}
