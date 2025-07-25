import type * as vscode from 'vscode';
import { ContextExtractor } from '../context/contextExtractor';
import { DebouncedCompletionManager } from '../performance/debouncedCompletionManager';
import { CompletionCache } from '../cache/completionCache';
import { Logger } from '../../utils/logger';
import { CompletionModeManager } from '../modes/completionModeManager';
import { MultiLanguageProvider } from '../languages/multiLanguageProvider';

export class ClaudeCompletionProvider
  implements vscode.CompletionItemProvider, vscode.InlineCompletionItemProvider
{
  private readonly contextExtractor: ContextExtractor;
  readonly debouncedManager: DebouncedCompletionManager;
  readonly cache: CompletionCache;
  private readonly logger: Logger;
  private readonly modeManager: CompletionModeManager;
  private readonly multiLanguageProvider: MultiLanguageProvider;

  constructor() {
    this.contextExtractor = new ContextExtractor();
    this.debouncedManager = new DebouncedCompletionManager();
    this.cache = new CompletionCache();
    this.logger = new Logger('ClaudeCompletionProvider');
    this.modeManager = new CompletionModeManager();
    this.multiLanguageProvider = new MultiLanguageProvider();
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
    try {
      const startTime = performance.now();

      // Get language-aware completions first
      const languageCompletions = await this.multiLanguageProvider.provideCompletions(
        document,
        position,
        context,
        token
      );

      // Get mode-specific completions
      const modeCompletions = await this.modeManager.provideCompletions(
        document,
        position,
        context,
        token,
        this.debouncedManager // Pass API client for advanced completions
      );

      // Combine completions (language completions first, then mode completions)
      const combinedCompletions = [...languageCompletions, ...modeCompletions];

      // If we have local completions, return them
      if (combinedCompletions.length > 0) {
        const latency = performance.now() - startTime;
        this.logger.info(`Local completion request took ${latency.toFixed(2)}ms`);
        return combinedCompletions;
      }

      // Otherwise, fall back to regular Claude completions
      // Extract context
      const codeContext = await this.contextExtractor.extractContext(document, position);

      // Check cache
      const cachedCompletions = this.cache.get(codeContext);
      if (cachedCompletions) {
        this.logger.info('Returning cached completions');
        return cachedCompletions;
      }

      // Get completions through debounced manager
      const completions = await this.debouncedManager.getCompletions(codeContext, token);

      // Cache results
      if (completions && completions.length > 0) {
        this.cache.set(codeContext, completions);
      }

      const latency = performance.now() - startTime;
      this.logger.info(`Completion request took ${latency.toFixed(2)}ms`);

      return completions;
    } catch (error) {
      this.logger.error('Error providing completions', error);
      return undefined;
    }
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    try {
      const startTime = performance.now();

      // Extract context
      const codeContext = await this.contextExtractor.extractContext(document, position);

      // Get inline completions
      const inlineCompletions = await this.debouncedManager.getInlineCompletions(
        codeContext,
        token
      );

      const latency = performance.now() - startTime;
      this.logger.info(`Inline completion request took ${latency.toFixed(2)}ms`);

      return inlineCompletions;
    } catch (error) {
      this.logger.error('Error providing inline completions', error);
      return undefined;
    }
  }

  getModeManager(): CompletionModeManager {
    return this.modeManager;
  }

  dispose(): void {
    this.debouncedManager.dispose();
    this.cache.clear();
    this.modeManager.dispose();
  }
}
