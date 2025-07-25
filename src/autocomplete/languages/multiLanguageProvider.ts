import * as vscode from 'vscode';
import type { LanguageInfo } from './languageDetector';
import { LanguageDetector } from './languageDetector';
import { LanguagePromptTemplate } from './languagePromptTemplate';
import { SyntaxAwareProvider } from './syntaxAwareProvider';
import type { FrameworkInfo } from './frameworkDetector';
import { FrameworkDetector } from './frameworkDetector';
import { CompletionMode } from '../modes/completionModes';
import { ModeDetector } from '../modes/modeDetector';

export interface MultiLanguageContext {
  language: LanguageInfo;
  frameworks: FrameworkInfo[];
  mode: CompletionMode;
  syntaxRules: any;
  promptConfig: any;
}

export class MultiLanguageProvider {
  private frameworkCache: Map<string, FrameworkInfo[]> = new Map();

  /**
   * Analyze document and provide language-aware completions
   */
  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    // Detect language
    const languageInfo = this.detectLanguage(document);
    if (!languageInfo) {
      return [];
    }

    // Detect frameworks
    const frameworks = await this.detectFrameworks(document);

    // Detect completion mode
    const mode = ModeDetector.detectFromPosition(document.getText(), position, document.languageId);

    // Get syntax rules
    const syntaxRules = SyntaxAwareProvider.getSyntaxRules(languageInfo.id);

    // Get prompt configuration
    const promptConfig = LanguagePromptTemplate.getTemplate(languageInfo.id, mode);

    const completions: vscode.CompletionItem[] = [];

    // Add syntax-aware completions
    if (syntaxRules) {
      const syntaxCompletions = SyntaxAwareProvider.generateSyntaxAwareCompletion({
        languageId: languageInfo.id,
        mode,
        prefix: document.lineAt(position).text.substring(0, position.character),
        suffix: document.lineAt(position).text.substring(position.character),
        indentLevel: this.getIndentLevel(document, position),
      });
      completions.push(...syntaxCompletions);
    }

    // Add framework-specific completions
    if (frameworks.length > 0) {
      const frameworkCompletions = FrameworkDetector.getFrameworkCompletions(
        frameworks,
        context,
        position,
        document
      );
      completions.push(...frameworkCompletions);
    }

    // Add language-specific snippet completions
    completions.push(...this.getLanguageSnippets(languageInfo, mode));

    return completions;
  }

  /**
   * Build context-aware prompt for API completion
   */
  async buildLanguageAwarePrompt(
    document: vscode.TextDocument,
    position: vscode.Position,
    mode: CompletionMode
  ): Promise<string> {
    const languageInfo = this.detectLanguage(document);
    if (!languageInfo) {
      return '';
    }

    const promptConfig = LanguagePromptTemplate.getTemplate(languageInfo.id, mode);
    if (!promptConfig) {
      return '';
    }

    // Extract context
    const { prefix, suffix, imports, types, relatedCode } = await this.extractContext(
      document,
      position
    );

    // Build prompt
    return LanguagePromptTemplate.buildPrompt(promptConfig, {
      prefix,
      suffix,
      imports,
      types,
      relatedCode,
    });
  }

  /**
   * Detect language from document
   */
  private detectLanguage(document: vscode.TextDocument): LanguageInfo | null {
    // Try VSCode language ID first
    let languageInfo = LanguageDetector.detectFromLanguageId(document.languageId);

    // Try file extension
    if (!languageInfo) {
      languageInfo = LanguageDetector.detectFromExtension(document.fileName);
    }

    // Try shebang
    if (!languageInfo && document.lineCount > 0) {
      const firstLine = document.lineAt(0).text;
      languageInfo = LanguageDetector.detectFromShebang(firstLine);
    }

    return languageInfo;
  }

  /**
   * Detect frameworks in document
   */
  private async detectFrameworks(document: vscode.TextDocument): Promise<FrameworkInfo[]> {
    // Check cache first
    const cacheKey = document.uri.toString();
    if (this.frameworkCache.has(cacheKey)) {
      return this.frameworkCache.get(cacheKey)!;
    }

    // Detect from content
    const contentFrameworks = FrameworkDetector.detectFrameworkFromContent(document);

    // Detect from workspace
    let workspaceFrameworks: FrameworkInfo[] = [];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      workspaceFrameworks = await FrameworkDetector.detectFrameworks(workspaceFolder);
    }

    // Combine and deduplicate
    const allFrameworks = [...contentFrameworks];
    for (const wf of workspaceFrameworks) {
      if (!allFrameworks.some((f) => f.id === wf.id)) {
        allFrameworks.push(wf);
      }
    }

    // Cache result
    this.frameworkCache.set(cacheKey, allFrameworks);

    return allFrameworks;
  }

  /**
   * Extract context for prompt building
   */
  private async extractContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{
    prefix: string;
    suffix: string;
    imports: string[];
    types: string[];
    relatedCode: string[];
  }> {
    const line = position.line;
    const char = position.character;

    // Get prefix and suffix
    const currentLine = document.lineAt(line).text;
    const prefix = currentLine.substring(0, char);
    const suffix = currentLine.substring(char);

    // Extract imports
    const imports = this.extractImports(document);

    // Extract type definitions
    const types = this.extractTypes(document);

    // Extract related code
    const relatedCode = this.extractRelatedCode(document, position);

    return { prefix, suffix, imports, types, relatedCode };
  }

  /**
   * Extract import statements
   */
  private extractImports(document: vscode.TextDocument): string[] {
    const imports: string[] = [];
    const text = document.getText();

    // JavaScript/TypeScript imports
    const jsImports = text.match(/^import\s+.*$/gm);
    if (jsImports) {
      imports.push(...jsImports);
    }

    // Python imports
    const pyImports = text.match(/^(?:from\s+\S+\s+)?import\s+.*$/gm);
    if (pyImports) {
      imports.push(...pyImports);
    }

    // Java imports
    const javaImports = text.match(/^import\s+[\w.]+\s*;$/gm);
    if (javaImports) {
      imports.push(...javaImports);
    }

    return imports.slice(0, 10); // Limit to 10 imports
  }

  /**
   * Extract type definitions
   */
  private extractTypes(document: vscode.TextDocument): string[] {
    const types: string[] = [];
    const text = document.getText();

    // TypeScript interfaces and types
    const tsTypes = text.match(/^(?:export\s+)?(?:interface|type)\s+\w+.*?$/gm);
    if (tsTypes) {
      types.push(...tsTypes);
    }

    // Python type hints
    const pyTypes = text.match(/^(?:class\s+\w+|def\s+\w+.*?->.*?):/gm);
    if (pyTypes) {
      types.push(...pyTypes);
    }

    return types.slice(0, 10); // Limit to 10 types
  }

  /**
   * Extract related code context
   */
  private extractRelatedCode(document: vscode.TextDocument, position: vscode.Position): string[] {
    const related: string[] = [];

    // Get surrounding function/class
    const surroundingCode = this.getSurroundingScope(document, position);
    if (surroundingCode) {
      related.push(surroundingCode);
    }

    return related;
  }

  /**
   * Get surrounding function or class scope
   */
  private getSurroundingScope(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | null {
    // Simple heuristic: look for function/class definition above
    for (let i = position.line - 1; i >= 0; i--) {
      const line = document.lineAt(i).text;

      // Check for function/method definition
      if (
        /^\s*(?:async\s+)?(?:function|def|fn)\s+\w+/.test(line) ||
        /^\s*(?:public|private|protected)?\s*\w+\s*\(/.test(line)
      ) {
        // Extract function until closing brace/dedent
        const functionLines = [line];
        for (let j = i + 1; j < document.lineCount && j < i + 20; j++) {
          functionLines.push(document.lineAt(j).text);
          if (/^\s*}/.test(document.lineAt(j).text)) {
            break;
          }
        }
        return functionLines.join('\n');
      }

      // Check for class definition
      if (/^\s*(?:export\s+)?class\s+\w+/.test(line)) {
        return line;
      }
    }

    return null;
  }

  /**
   * Get indent level at position
   */
  private getIndentLevel(document: vscode.TextDocument, position: vscode.Position): number {
    const line = document.lineAt(position).text;
    const match = line.match(/^(\s*)/);
    if (!match) return 0;

    const languageId = document.languageId;
    const syntaxRules = SyntaxAwareProvider.getSyntaxRules(languageId);

    if (!syntaxRules) return 0;

    const indentSize = syntaxRules.indentation.size;
    const spaces = match[1].replace(/\t/g, ' '.repeat(indentSize)).length;

    return Math.floor(spaces / indentSize);
  }

  /**
   * Get language-specific snippets
   */
  private getLanguageSnippets(
    language: LanguageInfo,
    mode: CompletionMode
  ): vscode.CompletionItem[] {
    const snippets: vscode.CompletionItem[] = [];

    // Add mode and language specific snippets
    if (mode === CompletionMode.FUNCTION && language.id === 'python') {
      const asyncSnippet = new vscode.CompletionItem(
        'async def',
        vscode.CompletionItemKind.Snippet
      );
      asyncSnippet.insertText = new vscode.SnippetString(
        'async def ${1:function_name}(${2:params}):\n    ${3:pass}'
      );
      asyncSnippet.detail = 'Async function definition';
      snippets.push(asyncSnippet);
    }

    if (mode === CompletionMode.BLOCK && language.id === 'javascript') {
      const trySnippet = new vscode.CompletionItem('try-catch', vscode.CompletionItemKind.Snippet);
      trySnippet.insertText = new vscode.SnippetString(
        'try {\n  ${1}\n} catch (error) {\n  ${2:console.error(error)}\n}'
      );
      trySnippet.detail = 'Try-catch block';
      snippets.push(trySnippet);
    }

    return snippets;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.frameworkCache.clear();
    FrameworkDetector.clearCache();
  }
}
