import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { TokenCounter } from '../utils/tokenCounter';
import { ContextDiffCalculator } from '../utils/contextDiff';
import { ContextCompressor } from '../utils/contextCompressor';

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
  document?: vscode.TextDocument;
  readmeContent?: string;
  currentScope?: SymbolInfo;
  projectInfo?: ProjectContext;
  relatedFiles?: string[];
  typeDefinitions?: TypeDefinition[];
}

export interface TypeDefinition {
  name: string;
  definition: string;
  source: string;
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
  private enableDiffOptimization: boolean = true;
  private enableCompression: boolean = true;

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

      // Get indentation (synchronous)
      const indentation = this.extractIndentation(currentLine);

      // Extract various context elements in parallel
      const [imports, symbols, projectContext, readmeContent] = await Promise.all([
        this.extractImports(document),
        this.extractSymbols(document, position),
        this.extractProjectContext(document),
        this.extractReadmeContent(),
      ]);

      // Get current scope (depends on symbols)
      const currentScope = this.getCurrentScope(symbols, position);

      // Extract type definitions for TypeScript (depends on symbols)
      const typeDefinitions = await this.extractTypeDefinitions(document, symbols);

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
        readmeContent,
        currentScope,
        document,
        projectInfo: projectContext,
        relatedFiles: projectContext?.relatedFiles,
        typeDefinitions,
      };

      // Generate hash for caching
      context.hash = this.generateContextHash(context);

      // Apply diff optimization if enabled
      let optimizedContext = context;
      if (this.enableDiffOptimization) {
        optimizedContext = ContextDiffCalculator.getIncrementalContext(context);
      }

      // Apply compression if enabled
      if (this.enableCompression) {
        optimizedContext = ContextCompressor.compressContext(optimizedContext);
        const compressionRatio = ContextCompressor.getCompressionRatio(context, optimizedContext);
        this.logger.debug(`Context compressed by ${compressionRatio.toFixed(1)}%`);
      }

      // Apply token limit truncation
      const model = 'claude-3-sonnet'; // TODO: Get from config
      const truncatedContext = TokenCounter.truncateContext(optimizedContext, model);

      // Log token usage
      const tokenInfo = TokenCounter.formatTokenInfo(truncatedContext, model);
      this.logger.debug(tokenInfo);

      const extractionTime = performance.now() - startTime;
      this.logger.info(`Context extraction took ${extractionTime.toFixed(2)}ms`);

      return truncatedContext;
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

  private async extractReadmeContent(): Promise<string | undefined> {
    try {
      // Look for README files in the workspace
      const readmePatterns = ['README.md', 'readme.md', 'README.MD', 'README.txt', 'README'];

      for (const pattern of readmePatterns) {
        const readmeFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);

        if (readmeFiles.length > 0) {
          const readmeContent = await vscode.workspace.fs.readFile(readmeFiles[0]);
          const content = readmeContent.toString();

          // Limit README content to first 1000 characters to avoid context bloat
          return content.length > 1000 ? content.substring(0, 1000) + '...' : content;
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error('Error extracting README content', error);
      return undefined;
    }
  }

  private getCurrentScope(
    symbols: SymbolInfo[],
    position: vscode.Position
  ): SymbolInfo | undefined {
    // Find the innermost symbol containing the cursor position
    let currentScope: SymbolInfo | undefined;
    let smallestRange: vscode.Range | undefined;

    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        if (!smallestRange || symbol.range.contains(smallestRange)) {
          smallestRange = symbol.range;
          currentScope = symbol;
        }
      }
    }

    return currentScope;
  }

  private async extractTypeDefinitions(
    document: vscode.TextDocument,
    symbols: SymbolInfo[]
  ): Promise<TypeDefinition[]> {
    const typeDefinitions: TypeDefinition[] = [];

    // Only extract for TypeScript files
    if (!['typescript', 'typescriptreact'].includes(document.languageId)) {
      return typeDefinitions;
    }

    try {
      // Find type-related symbols
      const typeSymbols = symbols.filter(
        (s) =>
          s.kind === vscode.SymbolKind.Interface ||
          s.kind === vscode.SymbolKind.Class ||
          s.kind === vscode.SymbolKind.Enum ||
          s.kind === vscode.SymbolKind.TypeParameter
      );

      // Extract type definitions from the document
      const text = document.getText();

      // Extract interface definitions
      const interfacePattern = /interface\s+(\w+)(?:<[^>]+>)?\s*(?:extends\s+[^{]+)?\s*{[^}]+}/g;
      let match;
      while ((match = interfacePattern.exec(text)) !== null) {
        typeDefinitions.push({
          name: match[1],
          definition: match[0],
          source: document.fileName,
        });
      }

      // Extract type aliases
      const typePattern = /type\s+(\w+)(?:<[^>]+>)?\s*=\s*[^;]+;/g;
      while ((match = typePattern.exec(text)) !== null) {
        typeDefinitions.push({
          name: match[1],
          definition: match[0],
          source: document.fileName,
        });
      }

      // Extract enum definitions
      const enumPattern = /enum\s+(\w+)\s*{[^}]+}/g;
      while ((match = enumPattern.exec(text)) !== null) {
        typeDefinitions.push({
          name: match[1],
          definition: match[0],
          source: document.fileName,
        });
      }

      // Try to get type definitions from imported .d.ts files
      const imports = await this.extractImports(document);
      const dtsImports = imports.filter((imp) => imp.endsWith('.d.ts'));
      for (const dtsImport of dtsImports.slice(0, 3)) {
        // Limit to 3 to avoid bloat
        try {
          const dtsUri = vscode.Uri.file(dtsImport);
          const dtsDoc = await vscode.workspace.openTextDocument(dtsUri);
          const dtsText = dtsDoc.getText();

          // Extract exported types from .d.ts
          const exportPattern = /export\s+(?:interface|type|enum)\s+(\w+)[^;{]*[;{]/g;
          while ((match = exportPattern.exec(dtsText)) !== null) {
            typeDefinitions.push({
              name: match[1],
              definition: match[0],
              source: dtsImport,
            });
          }
        } catch (error) {
          // Ignore errors for .d.ts files that can't be found
        }
      }

      // Limit to most relevant type definitions
      return typeDefinitions.slice(0, 10);
    } catch (error) {
      this.logger.error('Error extracting type definitions', error);
      return [];
    }
  }

  clearCache(): void {
    this.symbolCache.clear();
    this.importCache.clear();
    ContextDiffCalculator.reset();
  }

  setDiffOptimization(enabled: boolean): void {
    this.enableDiffOptimization = enabled;
    if (!enabled) {
      ContextDiffCalculator.reset();
    }
  }

  setCompression(enabled: boolean): void {
    this.enableCompression = enabled;
  }
}
