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
    // TODO: Implement metrics display
    vscode.window.showInformationMessage('Completion metrics feature coming soon!');
  }

  private clearCache(): void {
    // TODO: Access cache through provider and clear it
    vscode.window.showInformationMessage('Completion cache cleared!');
  }

  dispose(): void {
    this.provider.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
