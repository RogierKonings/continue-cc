import type * as vscode from 'vscode';
import { ContextExtractor } from '../context/contextExtractor';
import { DebouncedCompletionManager } from '../performance/debouncedCompletionManager';
import { CompletionCache } from '../cache/completionCache';
import { Logger } from '../../utils/logger';

export class ClaudeCompletionProvider
  implements vscode.CompletionItemProvider, vscode.InlineCompletionItemProvider
{
  private readonly contextExtractor: ContextExtractor;
  readonly debouncedManager: DebouncedCompletionManager;
  readonly cache: CompletionCache;
  private readonly logger: Logger;

  constructor() {
    this.contextExtractor = new ContextExtractor();
    this.debouncedManager = new DebouncedCompletionManager();
    this.cache = new CompletionCache();
    this.logger = new Logger('ClaudeCompletionProvider');
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
    try {
      const startTime = performance.now();

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

  dispose(): void {
    this.debouncedManager.dispose();
    this.cache.clear();
  }
}
