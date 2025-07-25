import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';

export interface SymbolInfo {
  name: string;
  kind: vscode.SymbolKind;
  location: vscode.Location;
  containerName?: string;
  detail?: string;
  signature?: string;
  documentation?: string;
  references?: vscode.Location[];
  usageCount?: number;
  lastAccessed?: Date;
}

export interface SymbolIndex {
  symbols: Map<string, SymbolInfo>;
  dependencies: Map<string, Set<string>>;
  usage: Map<string, number>;
  types: Map<string, TypeInfo>;
  docs: Map<string, string>;
}

export interface TypeInfo {
  name: string;
  definition: string;
  location: vscode.Location;
  kind: 'interface' | 'type' | 'class' | 'enum';
}

export class SymbolIndexer {
  private readonly logger: Logger;
  private readonly index: SymbolIndex;
  private readonly fileWatcher: vscode.FileSystemWatcher;
  private indexingPromise: Promise<void> | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.logger = new Logger('SymbolIndexer');
    this.index = {
      symbols: new Map(),
      dependencies: new Map(),
      usage: new Map(),
      types: new Map(),
      docs: new Map(),
    };

    // Set up file watcher for incremental updates
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{js,ts,jsx,tsx,py,java,go,rs}'
    );
    this.setupFileWatcher();
  }

  /**
   * Initialize the symbol index for the workspace
   */
  async initialize(): Promise<void> {
    if (this.indexingPromise) {
      return this.indexingPromise;
    }

    this.indexingPromise = this.performInitialIndexing();
    await this.indexingPromise;
    this.indexingPromise = null;
  }

  /**
   * Perform initial indexing of the workspace
   */
  private async performInitialIndexing(): Promise<void> {
    const startTime = Date.now();
    this.logger.info('Starting initial symbol indexing...');

    try {
      // Find all source files
      const files = await vscode.workspace.findFiles(
        '**/*.{js,ts,jsx,tsx,py,java,go,rs}',
        '**/node_modules/**'
      );

      // Index files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map((uri) => this.indexFile(uri)));
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `Initial indexing completed in ${duration}ms. Indexed ${this.index.symbols.size} symbols.`
      );
    } catch (error) {
      this.logger.error('Error during initial indexing:', error);
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(uri: vscode.Uri): Promise<void> {
    try {
      // Get document symbols
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols || symbols.length === 0) {
        return;
      }

      // Process symbols
      this.processDocumentSymbols(uri, symbols);

      // Extract type information
      await this.extractTypeInfo(uri);

      // Extract dependencies
      await this.extractDependencies(uri);
    } catch (error) {
      this.logger.debug(`Failed to index file ${uri.fsPath}:`, error);
    }
  }

  /**
   * Process document symbols recursively
   */
  private processDocumentSymbols(
    uri: vscode.Uri,
    symbols: vscode.DocumentSymbol[],
    containerName?: string
  ): void {
    for (const symbol of symbols) {
      const location = new vscode.Location(uri, symbol.range);
      const fullName = containerName ? `${containerName}.${symbol.name}` : symbol.name;

      const symbolInfo: SymbolInfo = {
        name: symbol.name,
        kind: symbol.kind,
        location,
        containerName,
        detail: symbol.detail,
        usageCount: 0,
        lastAccessed: new Date(),
      };

      // Store in index
      this.index.symbols.set(fullName, symbolInfo);

      // Initialize usage count
      this.index.usage.set(fullName, 0);

      // Process children recursively
      if (symbol.children && symbol.children.length > 0) {
        this.processDocumentSymbols(uri, symbol.children, fullName);
      }
    }
  }

  /**
   * Extract type information from a file
   */
  private async extractTypeInfo(uri: vscode.Uri): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();

      // Extract TypeScript interfaces and types
      const typePatterns = [
        /export\s+interface\s+(\w+)\s*{([^}]*)}/g,
        /export\s+type\s+(\w+)\s*=\s*([^;]+);/g,
        /interface\s+(\w+)\s*{([^}]*)}/g,
        /type\s+(\w+)\s*=\s*([^;]+);/g,
      ];

      for (const pattern of typePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const name = match[1];
          const definition = match[0];
          const offset = match.index;
          const position = document.positionAt(offset);
          const location = new vscode.Location(uri, position);

          this.index.types.set(name, {
            name,
            definition,
            location,
            kind: pattern.source.includes('interface') ? 'interface' : 'type',
          });
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to extract type info from ${uri.fsPath}:`, error);
    }
  }

  /**
   * Extract dependencies from a file
   */
  private async extractDependencies(uri: vscode.Uri): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const fileName = path.basename(uri.fsPath);

      const dependencies = new Set<string>();

      // Extract imports
      const importPatterns = [
        /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /from\s+([^\s]+)\s+import/g, // Python
      ];

      for (const pattern of importPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          dependencies.add(match[1]);
        }
      }

      this.index.dependencies.set(fileName, dependencies);
    } catch (error) {
      this.logger.debug(`Failed to extract dependencies from ${uri.fsPath}:`, error);
    }
  }

  /**
   * Set up file watcher for incremental updates
   */
  private setupFileWatcher(): void {
    // Handle file creation
    this.disposables.push(
      this.fileWatcher.onDidCreate(async (uri) => {
        this.logger.debug(`File created: ${uri.fsPath}`);
        await this.indexFile(uri);
      })
    );

    // Handle file changes
    this.disposables.push(
      this.fileWatcher.onDidChange(async (uri) => {
        this.logger.debug(`File changed: ${uri.fsPath}`);
        // Remove old symbols from this file
        this.removeFileSymbols(uri);
        // Re-index the file
        await this.indexFile(uri);
      })
    );

    // Handle file deletion
    this.disposables.push(
      this.fileWatcher.onDidDelete((uri) => {
        this.logger.debug(`File deleted: ${uri.fsPath}`);
        this.removeFileSymbols(uri);
      })
    );
  }

  /**
   * Remove symbols from a deleted or changed file
   */
  private removeFileSymbols(uri: vscode.Uri): void {
    const symbolsToRemove: string[] = [];

    // Find all symbols from this file
    for (const [name, info] of this.index.symbols) {
      if (info.location.uri.toString() === uri.toString()) {
        symbolsToRemove.push(name);
      }
    }

    // Remove symbols
    for (const name of symbolsToRemove) {
      this.index.symbols.delete(name);
      this.index.usage.delete(name);
    }

    // Remove types from this file
    const typesToRemove: string[] = [];
    for (const [name, info] of this.index.types) {
      if (info.location.uri.toString() === uri.toString()) {
        typesToRemove.push(name);
      }
    }

    for (const name of typesToRemove) {
      this.index.types.delete(name);
    }
  }

  /**
   * Get symbol by name
   */
  getSymbol(name: string): SymbolInfo | undefined {
    return this.index.symbols.get(name);
  }

  /**
   * Search symbols by partial name
   */
  searchSymbols(query: string, limit: number = 10): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [name, info] of this.index.symbols) {
      if (name.toLowerCase().includes(lowerQuery)) {
        results.push(info);
        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get symbols by kind
   */
  getSymbolsByKind(kind: vscode.SymbolKind): SymbolInfo[] {
    const results: SymbolInfo[] = [];

    for (const info of this.index.symbols.values()) {
      if (info.kind === kind) {
        results.push(info);
      }
    }

    return results;
  }

  /**
   * Track symbol usage
   */
  trackUsage(symbolName: string): void {
    const currentCount = this.index.usage.get(symbolName) || 0;
    this.index.usage.set(symbolName, currentCount + 1);

    const symbol = this.index.symbols.get(symbolName);
    if (symbol) {
      symbol.usageCount = currentCount + 1;
      symbol.lastAccessed = new Date();
    }
  }

  /**
   * Get most frequently used symbols
   */
  getMostUsedSymbols(limit: number = 10): SymbolInfo[] {
    const sorted = Array.from(this.index.symbols.values())
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit);

    return sorted;
  }

  /**
   * Get recently accessed symbols
   */
  getRecentSymbols(limit: number = 10): SymbolInfo[] {
    const sorted = Array.from(this.index.symbols.values())
      .filter((s) => s.lastAccessed)
      .sort((a, b) => {
        const timeA = a.lastAccessed?.getTime() || 0;
        const timeB = b.lastAccessed?.getTime() || 0;
        return timeB - timeA;
      })
      .slice(0, limit);

    return sorted;
  }

  /**
   * Get symbol dependencies
   */
  getSymbolDependencies(symbolName: string): string[] {
    const deps = this.index.dependencies.get(symbolName);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalSymbols: number;
    totalTypes: number;
    totalDependencies: number;
    symbolsByKind: Map<vscode.SymbolKind, number>;
  } {
    const symbolsByKind = new Map<vscode.SymbolKind, number>();

    for (const symbol of this.index.symbols.values()) {
      const count = symbolsByKind.get(symbol.kind) || 0;
      symbolsByKind.set(symbol.kind, count + 1);
    }

    return {
      totalSymbols: this.index.symbols.size,
      totalTypes: this.index.types.size,
      totalDependencies: this.index.dependencies.size,
      symbolsByKind,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.index.symbols.clear();
    this.index.dependencies.clear();
    this.index.usage.clear();
    this.index.types.clear();
    this.index.docs.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.clear();
  }
}
