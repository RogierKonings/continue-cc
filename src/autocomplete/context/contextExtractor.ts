import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

export interface CodeContext {
  language: string;
  currentLine: string;
  prefix: string;
  suffix: string;
  imports: string[];
  symbols: SymbolInfo[];
  fileContent: string;
  cursorPosition: vscode.Position;
  indentation: string;
  projectContext?: ProjectContext;
  hash?: string;
}

export interface SymbolInfo {
  name: string;
  kind: vscode.SymbolKind;
  range: vscode.Range;
  detail?: string;
}

export interface ProjectContext {
  projectType?: string;
  frameworks?: string[];
  dependencies?: string[];
  relatedFiles?: string[];
}

export class ContextExtractor {
  private readonly logger: Logger;
  private readonly symbolCache: Map<string, SymbolInfo[]>;
  private readonly importCache: Map<string, string[]>;

  constructor() {
    this.logger = new Logger('ContextExtractor');
    this.symbolCache = new Map();
    this.importCache = new Map();
  }

  async extractContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<CodeContext> {
    const startTime = performance.now();

    try {
      const language = document.languageId;
      const currentLine = document.lineAt(position.line).text;
      const offset = document.offsetAt(position);

      // Extract prefix and suffix
      const prefix = document.getText(
        new vscode.Range(new vscode.Position(Math.max(0, position.line - 50), 0), position)
      );

      const suffix = document.getText(
        new vscode.Range(
          position,
          new vscode.Position(Math.min(document.lineCount - 1, position.line + 50), 0)
        )
      );

      // Extract imports
      const imports = await this.extractImports(document);

      // Extract symbols
      const symbols = await this.extractSymbols(document, position);

      // Get indentation
      const indentation = this.extractIndentation(currentLine);

      // Get project context
      const projectContext = await this.extractProjectContext(document);

      // Create context object
      const context: CodeContext = {
        language,
        currentLine,
        prefix,
        suffix,
        imports,
        symbols,
        fileContent: document.getText(),
        cursorPosition: position,
        indentation,
        projectContext,
      };

      // Generate hash for caching
      context.hash = this.generateContextHash(context);

      const extractionTime = performance.now() - startTime;
      this.logger.info(`Context extraction took ${extractionTime.toFixed(2)}ms`);

      return context;
    } catch (error) {
      this.logger.error('Error extracting context', error);
      throw error;
    }
  }

  private async extractImports(document: vscode.TextDocument): Promise<string[]> {
    const cacheKey = `${document.uri.toString()}_${document.version}`;

    // Check cache
    if (this.importCache.has(cacheKey)) {
      return this.importCache.get(cacheKey)!;
    }

    const imports: string[] = [];
    const text = document.getText();
    const language = document.languageId;

    // Language-specific import patterns
    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /import\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]+})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g,
        /import\s*\(['"]([^'"]+)['"]\)/g,
        /require\s*\(['"]([^'"]+)['"]\)/g,
      ],
      javascript: [
        /import\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]+})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g,
        /import\s*\(['"]([^'"]+)['"]\)/g,
        /require\s*\(['"]([^'"]+)['"]\)/g,
      ],
      python: [/import\s+(\w+(?:\.\w+)*)/g, /from\s+(\w+(?:\.\w+)*)\s+import/g],
      java: [/import\s+([\w.]+);/g],
      cpp: [/#include\s*[<"]([^>"]+)[>"]/g],
      go: [/import\s+"([^"]+)"/g, /import\s+\(\s*"([^"]+)"/gm],
    };

    const languagePatterns = patterns[language] || [];

    for (const pattern of languagePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        imports.push(match[1]);
      }
    }

    // Cache results
    this.importCache.set(cacheKey, imports);

    return imports;
  }

  private async extractSymbols(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<SymbolInfo[]> {
    const cacheKey = `${document.uri.toString()}_${document.version}`;

    // Check cache
    if (this.symbolCache.has(cacheKey)) {
      return this.symbolCache.get(cacheKey)!;
    }

    try {
      // Get document symbols
      const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!documentSymbols) {
        return [];
      }

      // Flatten symbols and filter relevant ones
      const symbols = this.flattenSymbols(documentSymbols, position);

      // Cache results
      this.symbolCache.set(cacheKey, symbols);

      return symbols;
    } catch (error) {
      this.logger.error('Error extracting symbols', error);
      return [];
    }
  }

  private flattenSymbols(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
  ): SymbolInfo[] {
    const result: SymbolInfo[] = [];

    const processSymbol = (symbol: vscode.DocumentSymbol) => {
      // Add symbol if it's in scope
      if (symbol.range.contains(position) || symbol.range.end.isBefore(position)) {
        result.push({
          name: symbol.name,
          kind: symbol.kind,
          range: symbol.range,
          detail: symbol.detail,
        });
      }

      // Process children
      if (symbol.children) {
        symbol.children.forEach(processSymbol);
      }
    };

    symbols.forEach(processSymbol);
    return result;
  }

  private extractIndentation(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  private async extractProjectContext(document: vscode.TextDocument): Promise<ProjectContext> {
    const projectContext: ProjectContext = {};

    try {
      // Find package.json for JS/TS projects
      const packageJsonFiles = await vscode.workspace.findFiles(
        '**/package.json',
        '**/node_modules/**',
        1
      );
      if (packageJsonFiles.length > 0) {
        const packageJson = await vscode.workspace.fs.readFile(packageJsonFiles[0]);
        const packageData = JSON.parse(packageJson.toString());

        projectContext.dependencies = Object.keys(packageData.dependencies || {});

        // Detect frameworks
        const deps = [
          ...Object.keys(packageData.dependencies || {}),
          ...Object.keys(packageData.devDependencies || {}),
        ];
        projectContext.frameworks = this.detectFrameworks(deps);
        projectContext.projectType = 'node';
      }

      // Find related files
      const currentFileName = document.fileName;
      const baseName = currentFileName.replace(/\.(ts|js|tsx|jsx)$/, '');
      const relatedPatterns = [
        `${baseName}.test.*`,
        `${baseName}.spec.*`,
        `${baseName}.d.ts`,
        `${baseName}.*`,
      ];

      projectContext.relatedFiles = [];
      for (const pattern of relatedPatterns) {
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5);
        projectContext.relatedFiles.push(...files.map((f) => f.fsPath));
      }
    } catch (error) {
      this.logger.error('Error extracting project context', error);
    }

    return projectContext;
  }

  private detectFrameworks(dependencies: string[]): string[] {
    const frameworks: string[] = [];
    const frameworkMap: Record<string, string> = {
      react: 'React',
      vue: 'Vue',
      '@angular/core': 'Angular',
      svelte: 'Svelte',
      express: 'Express',
      fastify: 'Fastify',
      django: 'Django',
      flask: 'Flask',
      spring: 'Spring',
    };

    for (const [dep, framework] of Object.entries(frameworkMap)) {
      if (dependencies.includes(dep)) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  private generateContextHash(context: CodeContext): string {
    const hashContent = `${context.language}_${context.prefix}_${context.suffix}_${context.imports.join(',')}`;
    // Simple hash function for demo purposes
    let hash = 0;
    for (let i = 0; i < hashContent.length; i++) {
      const char = hashContent.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  clearCache(): void {
    this.symbolCache.clear();
    this.importCache.clear();
  }
}
