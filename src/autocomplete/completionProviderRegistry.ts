import * as vscode from 'vscode';
import { ClaudeCompletionProvider } from './providers/claudeCompletionProvider';
import { Logger } from '../utils/logger';

export class CompletionProviderRegistry {
  private readonly logger: Logger;
  private readonly provider: ClaudeCompletionProvider;
  private readonly disposables: vscode.Disposable[] = [];

  // Supported languages
  private readonly supportedLanguages = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'python',
    'java',
    'cpp',
    'c',
    'go',
    'rust',
    'csharp',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'scala',
    'r',
    'lua',
    'dart',
    'julia',
  ];

  // Language-specific trigger characters
  private readonly triggerCharacters: Record<string, string[]> = {
    default: ['.', ' '],
    javascript: ['.', ' ', '(', '[', '{', ':', '='],
    typescript: ['.', ' ', '(', '[', '{', ':', '=', '<'],
    python: ['.', ' ', '(', '[', '{', ':', '='],
    cpp: ['.', '->', '::', ' ', '(', '[', '{'],
    java: ['.', ' ', '(', '[', '{', '@'],
    go: ['.', ' ', '(', '[', '{', ':'],
    rust: ['.', '::', ' ', '(', '[', '{', '<'],
  };

  constructor() {
    this.logger = new Logger('CompletionProviderRegistry');
    this.provider = new ClaudeCompletionProvider();
  }

  register(context: vscode.ExtensionContext): void {
    this.logger.info('Registering completion providers...');

    // Register standard completion provider for each language
    for (const language of this.supportedLanguages) {
      const triggerChars = this.triggerCharacters[language] || this.triggerCharacters.default;

      const disposable = vscode.languages.registerCompletionItemProvider(
        { language, scheme: 'file' },
        this.provider,
        ...triggerChars
      );

      this.disposables.push(disposable);
      this.logger.info(`Registered completion provider for ${language}`);
    }

    // Register inline completion provider
    const inlineDisposable = vscode.languages.registerInlineCompletionItemProvider(
      this.supportedLanguages.map((lang) => ({ language: lang, scheme: 'file' })),
      this.provider
    );
    this.disposables.push(inlineDisposable);

    // Register commands
    this.registerCommands(context);

    // Add disposables to extension context
    context.subscriptions.push(...this.disposables);

    this.logger.info('Completion providers registered successfully');
  }

  private registerCommands(context: vscode.ExtensionContext): void {
    // Command to track completion acceptance
    const trackCompletionCommand = vscode.commands.registerCommand(
      'continue-cc.trackCompletion',
      (completion: string) => {
        this.logger.info(`Completion accepted: ${completion}`);
        // TODO: Send telemetry or update metrics
      }
    );
    this.disposables.push(trackCompletionCommand);

    // Command to track inline completion acceptance
    const trackInlineCompletionCommand = vscode.commands.registerCommand(
      'continue-cc.trackInlineCompletion',
      (completion: string) => {
        this.logger.info(`Inline completion accepted: ${completion}`);
        // TODO: Send telemetry or update metrics
      }
    );
    this.disposables.push(trackInlineCompletionCommand);

    // Command to show completion metrics
    const showMetricsCommand = vscode.commands.registerCommand(
      'continue-cc.showCompletionMetrics',
      () => {
        this.showMetrics();
      }
    );
    this.disposables.push(showMetricsCommand);

    // Command to clear completion cache
    const clearCacheCommand = vscode.commands.registerCommand(
      'continue-cc.clearCompletionCache',
      () => {
        this.clearCache();
      }
    );
    this.disposables.push(clearCacheCommand);
  }

  private showMetrics(): void {
    const cacheMetrics = this.provider.cache.getMetrics();
    const debouncerMetrics = this.provider.debouncedManager.getMetrics();

    const message = `Completion Performance Metrics:
Cache:
  - Size: ${cacheMetrics.size}
  - Hit Rate: ${cacheMetrics.hitRate.toFixed(1)}%
  - Miss Rate: ${cacheMetrics.missRate.toFixed(1)}%
  - Evictions: ${cacheMetrics.evictionCount}
  - Memory Usage: ${(cacheMetrics.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB

Debouncer:
  - Pending Requests: ${debouncerMetrics.pendingRequests}
  - Avg Typing Speed: ${debouncerMetrics.averageTypingSpeed.toFixed(1)} chars/sec
  - Last Debounce Delay: ${debouncerMetrics.lastDebounceDelay}ms`;

    vscode.window.showInformationMessage(message, { modal: true });
  }

  private clearCache(): void {
    this.provider.cache.clear();
    this.provider.cache.resetMetrics();
    vscode.window.showInformationMessage('Completion cache cleared successfully');
  }

  getProvider(): ClaudeCompletionProvider {
    return this.provider;
  }

  dispose(): void {
    this.provider.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
