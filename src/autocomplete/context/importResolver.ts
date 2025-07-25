import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger';

export interface ImportInfo {
  source: string;
  imports: string[];
  isDefault?: boolean;
  isNamespace?: boolean;
  alias?: string;
  resolvedPath?: string;
}

export interface ImportGraph {
  imports: Map<string, ImportInfo[]>;
  exports: Map<string, ExportInfo[]>;
  dependencies: Map<string, Set<string>>;
}

export interface ExportInfo {
  name: string;
  kind: 'default' | 'named' | 'namespace';
  source: string;
}

export class ImportResolver {
  private readonly logger: Logger;
  private readonly importGraph: ImportGraph;
  private readonly moduleAliases: Map<string, string>;
  private workspaceRoot: string;

  constructor() {
    this.logger = new Logger('ImportResolver');
    this.importGraph = {
      imports: new Map(),
      exports: new Map(),
      dependencies: new Map(),
    };
    this.moduleAliases = new Map();
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Load module aliases from config files
    this.loadModuleAliases();
  }

  /**
   * Load module aliases from tsconfig/jsconfig
   */
  private async loadModuleAliases(): Promise<void> {
    try {
      // Check for tsconfig.json
      const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        const paths = tsconfig.compilerOptions?.paths || {};

        for (const [alias, targets] of Object.entries(paths)) {
          if (Array.isArray(targets) && targets.length > 0) {
            // Remove wildcard and use first target
            const cleanAlias = alias.replace('/*', '');
            const cleanTarget = (targets[0] as string).replace('/*', '');
            this.moduleAliases.set(cleanAlias, path.join(this.workspaceRoot, cleanTarget));
          }
        }
      }

      // Check for jsconfig.json
      const jsconfigPath = path.join(this.workspaceRoot, 'jsconfig.json');
      if (fs.existsSync(jsconfigPath) && !fs.existsSync(tsconfigPath)) {
        const jsconfig = JSON.parse(fs.readFileSync(jsconfigPath, 'utf8'));
        const paths = jsconfig.compilerOptions?.paths || {};

        for (const [alias, targets] of Object.entries(paths)) {
          if (Array.isArray(targets) && targets.length > 0) {
            const cleanAlias = alias.replace('/*', '');
            const cleanTarget = (targets[0] as string).replace('/*', '');
            this.moduleAliases.set(cleanAlias, path.join(this.workspaceRoot, cleanTarget));
          }
        }
      }

      // Common webpack aliases
      this.moduleAliases.set('@', path.join(this.workspaceRoot, 'src'));
      this.moduleAliases.set('~', path.join(this.workspaceRoot, 'src'));

      this.logger.info(`Loaded ${this.moduleAliases.size} module aliases`);
    } catch (error) {
      this.logger.error('Failed to load module aliases:', error);
    }
  }

  /**
   * Analyze imports in a document
   */
  async analyzeImports(document: vscode.TextDocument): Promise<ImportInfo[]> {
    const imports: ImportInfo[] = [];
    const text = document.getText();
    const filePath = document.uri.fsPath;

    // JavaScript/TypeScript imports
    if (
      ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(
        document.languageId
      )
    ) {
      imports.push(...this.extractJSImports(text, filePath));
    }

    // Python imports
    if (document.languageId === 'python') {
      imports.push(...this.extractPythonImports(text, filePath));
    }

    // Store in graph
    this.importGraph.imports.set(filePath, imports);

    // Update dependencies
    const deps = new Set<string>();
    for (const imp of imports) {
      if (imp.resolvedPath) {
        deps.add(imp.resolvedPath);
      }
    }
    this.importGraph.dependencies.set(filePath, deps);

    return imports;
  }

  /**
   * Extract JavaScript/TypeScript imports
   */
  private extractJSImports(text: string, filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // ES6 imports
    const es6ImportRegex =
      /import\s+(?:(\*\s+as\s+\w+)|(\w+)|({[^}]+}))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = es6ImportRegex.exec(text)) !== null) {
      const namespaceImport = match[1];
      const defaultImport = match[2];
      const namedImports = match[3];
      const source = match[4];

      if (namespaceImport) {
        imports.push({
          source,
          imports: [namespaceImport.replace('* as ', '')],
          isNamespace: true,
          resolvedPath: this.resolveImportPath(source, filePath),
        });
      } else if (defaultImport) {
        imports.push({
          source,
          imports: [defaultImport],
          isDefault: true,
          resolvedPath: this.resolveImportPath(source, filePath),
        });
      } else if (namedImports) {
        const names = namedImports
          .replace(/[{}]/g, '')
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n);

        imports.push({
          source,
          imports: names,
          resolvedPath: this.resolveImportPath(source, filePath),
        });
      }
    }

    // CommonJS requires
    const requireRegex = /const\s+(?:(\w+)|{([^}]+)})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    while ((match = requireRegex.exec(text)) !== null) {
      const singleImport = match[1];
      const destructuredImports = match[2];
      const source = match[3];

      if (singleImport) {
        imports.push({
          source,
          imports: [singleImport],
          resolvedPath: this.resolveImportPath(source, filePath),
        });
      } else if (destructuredImports) {
        const names = destructuredImports
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n);

        imports.push({
          source,
          imports: names,
          resolvedPath: this.resolveImportPath(source, filePath),
        });
      }
    }

    return imports;
  }

  /**
   * Extract Python imports
   */
  private extractPythonImports(text: string, filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // import module
    const importRegex = /^import\s+(\S+)(?:\s+as\s+(\w+))?/gm;
    let match;

    while ((match = importRegex.exec(text)) !== null) {
      const module = match[1];
      const alias = match[2];

      imports.push({
        source: module,
        imports: [alias || module],
        alias,
        resolvedPath: this.resolvePythonImport(module, filePath),
      });
    }

    // from module import ...
    const fromImportRegex = /^from\s+(\S+)\s+import\s+(.+)/gm;

    while ((match = fromImportRegex.exec(text)) !== null) {
      const module = match[1];
      const importsList = match[2];

      const names = importsList
        .split(',')
        .map((n) => n.trim())
        .map((n) => {
          const parts = n.split(/\s+as\s+/);
          return parts[1] || parts[0];
        });

      imports.push({
        source: module,
        imports: names,
        resolvedPath: this.resolvePythonImport(module, filePath),
      });
    }

    return imports;
  }

  /**
   * Resolve import path for JavaScript/TypeScript
   */
  private resolveImportPath(importPath: string, fromFile: string): string | undefined {
    try {
      // Handle relative imports
      if (importPath.startsWith('.')) {
        const dir = path.dirname(fromFile);
        const resolved = path.resolve(dir, importPath);

        // Try different extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
        for (const ext of extensions) {
          const withExt = resolved + ext;
          if (fs.existsSync(withExt)) {
            return withExt;
          }
        }

        // Try index files
        const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
        for (const indexFile of indexFiles) {
          const indexPath = path.join(resolved, indexFile);
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }

        return resolved;
      }

      // Handle module aliases
      for (const [alias, targetPath] of this.moduleAliases) {
        if (importPath.startsWith(alias)) {
          const relativePath = importPath.slice(alias.length).replace(/^\//, '');
          const resolved = path.join(targetPath, relativePath);

          // Try with extensions
          const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
          for (const ext of extensions) {
            const withExt = resolved + ext;
            if (fs.existsSync(withExt)) {
              return withExt;
            }
          }

          return resolved;
        }
      }

      // Handle node_modules
      const nodeModulesPath = path.join(this.workspaceRoot, 'node_modules', importPath);
      if (fs.existsSync(nodeModulesPath)) {
        // Check package.json for main entry
        const packageJsonPath = path.join(nodeModulesPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const main = packageJson.main || 'index.js';
            return path.join(nodeModulesPath, main);
          } catch {
            // Fallback to index.js
            return path.join(nodeModulesPath, 'index.js');
          }
        }
      }

      return undefined;
    } catch (error) {
      this.logger.debug(`Failed to resolve import ${importPath} from ${fromFile}:`, error);
      return undefined;
    }
  }

  /**
   * Resolve Python import path
   */
  private resolvePythonImport(module: string, fromFile: string): string | undefined {
    try {
      // Convert module path to file path
      const parts = module.split('.');
      const relativePath = parts.join(path.sep) + '.py';

      // Try relative to current file
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, relativePath);
      if (fs.existsSync(resolved)) {
        return resolved;
      }

      // Try relative to workspace root
      const fromRoot = path.join(this.workspaceRoot, relativePath);
      if (fs.existsSync(fromRoot)) {
        return fromRoot;
      }

      // Try as package
      const packagePath = path.join(this.workspaceRoot, parts[0], '__init__.py');
      if (fs.existsSync(packagePath)) {
        return packagePath;
      }

      return undefined;
    } catch (error) {
      this.logger.debug(`Failed to resolve Python import ${module}:`, error);
      return undefined;
    }
  }

  /**
   * Get all imports for a file
   */
  getImports(filePath: string): ImportInfo[] {
    return this.importGraph.imports.get(filePath) || [];
  }

  /**
   * Get transitive dependencies
   */
  getTransitiveDependencies(filePath: string, visited = new Set<string>()): Set<string> {
    if (visited.has(filePath)) {
      return visited;
    }

    visited.add(filePath);
    const directDeps = this.importGraph.dependencies.get(filePath) || new Set();

    for (const dep of directDeps) {
      this.getTransitiveDependencies(dep, visited);
    }

    return visited;
  }

  /**
   * Find all files that import a given file
   */
  findImporters(filePath: string): string[] {
    const importers: string[] = [];

    for (const [file, deps] of this.importGraph.dependencies) {
      if (deps.has(filePath)) {
        importers.push(file);
      }
    }

    return importers;
  }

  /**
   * Clear the import graph
   */
  clear(): void {
    this.importGraph.imports.clear();
    this.importGraph.exports.clear();
    this.importGraph.dependencies.clear();
  }
}
