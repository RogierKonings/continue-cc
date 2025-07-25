import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { SymbolInfo } from './symbolIndexer';
import { SymbolIndexer } from './symbolIndexer';
import type { ImportInfo } from './importResolver';
import { ImportResolver } from './importResolver';
import type { ContextScore } from './contextRanker';
import { ContextRanker } from './contextRanker';
import { Logger } from '../../utils/logger';
import type { CodeContext } from './contextExtractor';

export interface SmartContext {
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  types: Map<string, any>;
  documentation: Map<string, string>;
  relatedFiles: string[];
  projectInfo: ProjectInfo;
  rankedContext: ContextScore[];
}

export interface ProjectInfo {
  name: string;
  type: 'node' | 'python' | 'java' | 'other';
  frameworks: string[];
  dependencies: string[];
  readme?: string;
}

export class SmartContextAnalyzer {
  private readonly logger: Logger;
  private readonly symbolIndexer: SymbolIndexer;
  private readonly importResolver: ImportResolver;
  private readonly contextRanker: ContextRanker;
  private projectInfo: ProjectInfo | null = null;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('SmartContextAnalyzer');
    this.symbolIndexer = new SymbolIndexer();
    this.importResolver = new ImportResolver();
    this.contextRanker = new ContextRanker();
  }

  /**
   * Initialize the smart context analyzer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize symbol indexer
      await this.symbolIndexer.initialize();

      // Analyze project
      this.projectInfo = await this.analyzeProject();

      this.isInitialized = true;
      this.logger.info('Smart context analyzer initialized');
    } catch (error) {
      this.logger.error('Failed to initialize smart context analyzer:', error);
    }
  }

  /**
   * Analyze project structure and metadata
   */
  private async analyzeProject(): Promise<ProjectInfo> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const info: ProjectInfo = {
      name: path.basename(workspaceRoot),
      type: 'other',
      frameworks: [],
      dependencies: [],
    };

    // Detect project type
    if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
      info.type = 'node';
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')
      );
      info.dependencies = Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      });

      // Detect frameworks
      if (info.dependencies.includes('react')) info.frameworks.push('react');
      if (info.dependencies.includes('vue')) info.frameworks.push('vue');
      if (info.dependencies.includes('angular')) info.frameworks.push('angular');
      if (info.dependencies.includes('express')) info.frameworks.push('express');
      if (info.dependencies.includes('next')) info.frameworks.push('nextjs');
    } else if (
      fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) ||
      fs.existsSync(path.join(workspaceRoot, 'setup.py'))
    ) {
      info.type = 'python';

      // Check for common Python frameworks
      const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf8');
        if (requirements.includes('django')) info.frameworks.push('django');
        if (requirements.includes('flask')) info.frameworks.push('flask');
        if (requirements.includes('fastapi')) info.frameworks.push('fastapi');
      }
    } else if (
      fs.existsSync(path.join(workspaceRoot, 'pom.xml')) ||
      fs.existsSync(path.join(workspaceRoot, 'build.gradle'))
    ) {
      info.type = 'java';

      // Check for Spring
      const pomPath = path.join(workspaceRoot, 'pom.xml');
      if (fs.existsSync(pomPath)) {
        const pom = fs.readFileSync(pomPath, 'utf8');
        if (pom.includes('spring')) info.frameworks.push('spring');
      }
    }

    // Read README
    const readmePaths = ['README.md', 'readme.md', 'Readme.md', 'README.txt'];
    for (const readmePath of readmePaths) {
      const fullPath = path.join(workspaceRoot, readmePath);
      if (fs.existsSync(fullPath)) {
        info.readme = fs.readFileSync(fullPath, 'utf8').slice(0, 1000); // First 1000 chars
        break;
      }
    }

    return info;
  }

  /**
   * Get smart context for a position in a document
   */
  async getSmartContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxContextSize: number = 4000
  ): Promise<SmartContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Analyze imports in current file
    const imports = await this.importResolver.analyzeImports(document);

    // Get symbols from current scope
    const currentScope = await this.getCurrentScope(document, position);

    // Search for relevant symbols
    const relevantSymbols = this.findRelevantSymbols(document, position, currentScope);

    // Get types used in current context
    const types = await this.extractLocalTypes(document, position);

    // Find related files
    const relatedFiles = this.findRelatedFiles(document.uri.fsPath, imports);

    // Extract documentation
    const documentation = await this.extractDocumentation(relevantSymbols);

    // Rank context by relevance
    const rankedContext = this.contextRanker.rankSymbols(
      relevantSymbols,
      position,
      document.uri,
      this.getCurrentWord(document, position)
    );

    // Filter to fit in context window
    const filteredContext = this.filterByContextSize(rankedContext, maxContextSize);

    return {
      symbols: filteredContext.map((c) => c.symbol),
      imports,
      types,
      documentation,
      relatedFiles,
      projectInfo: this.projectInfo!,
      rankedContext: filteredContext,
    };
  }

  /**
   * Get the current scope (function/class) at position
   */
  private async getCurrentScope(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<SymbolInfo | undefined> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols) return undefined;

      return this.findContainingSymbol(symbols, position);
    } catch (error) {
      this.logger.debug('Failed to get current scope:', error);
      return undefined;
    }
  }

  /**
   * Find the symbol containing the given position
   */
  private findContainingSymbol(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
  ): SymbolInfo | undefined {
    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        // Check children first for more specific scope
        if (symbol.children && symbol.children.length > 0) {
          const child = this.findContainingSymbol(symbol.children, position);
          if (child) return child;
        }

        // Return this symbol
        return {
          name: symbol.name,
          kind: symbol.kind,
          location: new vscode.Location(vscode.window.activeTextEditor!.document.uri, symbol.range),
          detail: symbol.detail,
        };
      }
    }

    return undefined;
  }

  /**
   * Find symbols relevant to current context
   */
  private findRelevantSymbols(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentScope?: SymbolInfo
  ): SymbolInfo[] {
    const relevant: SymbolInfo[] = [];

    // Add symbols from current file
    const fileSymbols = this.getFileSymbols(document.uri);
    relevant.push(...fileSymbols);

    // Add symbols from imported files
    const imports = this.importResolver.getImports(document.uri.fsPath);
    for (const imp of imports) {
      if (imp.resolvedPath) {
        const importedSymbols = this.getFileSymbols(vscode.Uri.file(imp.resolvedPath));
        relevant.push(...importedSymbols.filter((s) => imp.imports.includes(s.name)));
      }
    }

    // Add frequently used symbols
    const frequentSymbols = this.symbolIndexer.getMostUsedSymbols(20);
    relevant.push(...frequentSymbols);

    // Add recently used symbols
    const recentSymbols = this.symbolIndexer.getRecentSymbols(10);
    relevant.push(...recentSymbols);

    // Remove duplicates
    const seen = new Set<string>();
    return relevant.filter((s) => {
      const key = `${s.name}:${s.location.uri.toString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get symbols from a specific file
   */
  private getFileSymbols(uri: vscode.Uri): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Get from symbol indexer
    for (const [name, info] of this.symbolIndexer['index'].symbols) {
      if (info.location.uri.toString() === uri.toString()) {
        symbols.push(info);
      }
    }

    return symbols;
  }

  /**
   * Extract types used in current context
   */
  private async extractLocalTypes(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<Map<string, any>> {
    const types = new Map<string, any>();

    // Get types from symbol indexer
    const indexedTypes = this.symbolIndexer['index'].types;

    // Add types from current file and imports
    for (const [name, typeInfo] of indexedTypes) {
      types.set(name, typeInfo);
    }

    return types;
  }

  /**
   * Find files related to current file
   */
  private findRelatedFiles(currentFile: string, imports: ImportInfo[]): string[] {
    const related = new Set<string>();

    // Add imported files
    for (const imp of imports) {
      if (imp.resolvedPath) {
        related.add(imp.resolvedPath);
      }
    }

    // Add files that import current file
    const importers = this.importResolver.findImporters(currentFile);
    importers.forEach((f) => related.add(f));

    // Add test files
    const testPatterns = [
      currentFile.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
      currentFile.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1'),
      currentFile.replace(/\/src\//, '/test/').replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
    ];

    for (const pattern of testPatterns) {
      if (fs.existsSync(pattern)) {
        related.add(pattern);
      }
    }

    return Array.from(related);
  }

  /**
   * Extract documentation for symbols
   */
  private async extractDocumentation(symbols: SymbolInfo[]): Promise<Map<string, string>> {
    const docs = new Map<string, string>();

    // For now, use symbol details as documentation
    for (const symbol of symbols) {
      if (symbol.detail || symbol.documentation) {
        docs.set(symbol.name, symbol.detail || symbol.documentation || '');
      }
    }

    return docs;
  }

  /**
   * Get current word at position
   */
  private getCurrentWord(document: vscode.TextDocument, position: vscode.Position): string {
    const range = document.getWordRangeAtPosition(position);
    return range ? document.getText(range) : '';
  }

  /**
   * Filter context to fit within size limit
   */
  private filterByContextSize(rankedContext: ContextScore[], maxSize: number): ContextScore[] {
    const filtered: ContextScore[] = [];
    let currentSize = 0;

    for (const context of rankedContext) {
      const symbolSize = this.estimateSymbolSize(context.symbol);

      if (currentSize + symbolSize > maxSize) {
        break;
      }

      filtered.push(context);
      currentSize += symbolSize;
    }

    return filtered;
  }

  /**
   * Estimate size of a symbol in tokens
   */
  private estimateSymbolSize(symbol: SymbolInfo): number {
    let size = symbol.name.length / 4; // Rough token estimate

    if (symbol.detail) {
      size += symbol.detail.length / 4;
    }

    if (symbol.signature) {
      size += symbol.signature.length / 4;
    }

    return Math.ceil(size);
  }

  /**
   * Build enhanced context for API requests
   */
  buildEnhancedContext(baseContext: CodeContext, smartContext: SmartContext): CodeContext {
    // Add project info
    baseContext.projectContext = {
      projectType: smartContext.projectInfo.type,
      frameworks: smartContext.projectInfo.frameworks,
      dependencies: smartContext.projectInfo.dependencies.slice(0, 20),
      relatedFiles: smartContext.relatedFiles.slice(0, 10),
    };

    // Add relevant symbols
    baseContext.symbols = smartContext.symbols.slice(0, 20).map((s) => ({
      name: s.name,
      kind: s.kind,
      range: s.location.range,
      detail: s.detail,
    }));

    // Add type definitions
    baseContext.typeDefinitions = Array.from(smartContext.types.entries())
      .slice(0, 10)
      .map(([name, info]) => ({
        name,
        definition: info.definition || '',
        source: info.location?.uri.fsPath || '',
      }));

    // Add README content if available
    if (smartContext.projectInfo.readme) {
      baseContext.readmeContent = smartContext.projectInfo.readme;
    }

    return baseContext;
  }

  /**
   * Track symbol usage for learning
   */
  trackSymbolUsage(symbolName: string): void {
    this.symbolIndexer.trackUsage(symbolName);
  }

  /**
   * Clear caches and indexes
   */
  clear(): void {
    this.symbolIndexer.clear();
    this.importResolver.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.symbolIndexer.dispose();
  }
}
