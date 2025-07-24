import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { APIError, ErrorCategory } from './errors';
import { Logger } from '../utils/logger';

interface NotificationAction {
  label: string;
  action: () => void | Promise<void>;
}

interface NotificationOptions {
  severity: 'info' | 'warning' | 'error';
  persistent?: boolean;
  actions?: NotificationAction[];
  detail?: string;
}

export class NotificationManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly errorLog: Map<string, APIError[]> = new Map();
  private readonly maxLogSize = 100;
  private toastTimeout?: NodeJS.Timeout;

  constructor() {
    super();
    this.logger = new Logger('NotificationManager');
  }

  public notifyError(error: APIError): void {
    this.logError(error);

    const options = this.getNotificationOptions(error);
    const message = this.formatErrorMessage(error);

    switch (options.severity) {
      case 'error':
        this.showErrorNotification(message, options);
        break;
      case 'warning':
        this.showWarningNotification(message, options);
        break;
      case 'info':
        this.showInfoNotification(message, options);
        break;
    }
  }

  private getNotificationOptions(error: APIError): NotificationOptions {
    const actions: NotificationAction[] = [];

    switch (error.category) {
      case ErrorCategory.AUTHENTICATION:
        return {
          severity: 'error',
          persistent: true,
          actions: [
            {
              label: 'Sign In',
              action: () => vscode.commands.executeCommand('continue-cc.signIn'),
            },
          ],
        };

      case ErrorCategory.NETWORK:
        actions.push({
          label: 'Retry',
          action: () => this.emit('retryRequested', error),
        });

        if (error.message.includes('proxy')) {
          actions.push({
            label: 'Configure Proxy',
            action: () =>
              vscode.commands.executeCommand('workbench.action.openSettings', 'http.proxy'),
          });
        }

        return {
          severity: 'error',
          persistent: false,
          actions,
        };

      case ErrorCategory.RATE_LIMIT:
        return {
          severity: 'warning',
          persistent: false,
          actions: [
            {
              label: 'View Usage',
              action: () => vscode.commands.executeCommand('continue-cc.showUsageDetails'),
            },
            {
              label: 'Upgrade Plan',
              action: () => vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/upgrade')),
            },
          ],
        };

      case ErrorCategory.SERVER:
        return {
          severity: 'warning',
          persistent: false,
          actions: [
            {
              label: 'Check Status',
              action: () => vscode.env.openExternal(vscode.Uri.parse('https://status.claude.ai')),
            },
          ],
        };

      default:
        return {
          severity: 'error',
          persistent: false,
        };
    }
  }

  private formatErrorMessage(error: APIError): string {
    let message = error.userMessage;

    // Add contextual information
    if (error.requestContext?.requestId) {
      message += ` (Request ID: ${error.requestContext.requestId})`;
    }

    return message;
  }

  private async showErrorNotification(
    message: string,
    options: NotificationOptions
  ): Promise<void> {
    const actions = options.actions?.map((a) => a.label) || [];
    actions.push('View Log');

    const selection = await vscode.window.showErrorMessage(
      message,
      { detail: options.detail, modal: options.persistent },
      ...actions
    );

    if (selection) {
      if (selection === 'View Log') {
        this.showErrorLog();
      } else {
        const action = options.actions?.find((a) => a.label === selection);
        if (action) {
          await action.action();
        }
      }
    }
  }

  private async showWarningNotification(
    message: string,
    options: NotificationOptions
  ): Promise<void> {
    const actions = options.actions?.map((a) => a.label) || [];

    const selection = await vscode.window.showWarningMessage(
      message,
      { detail: options.detail },
      ...actions
    );

    if (selection) {
      const action = options.actions?.find((a) => a.label === selection);
      if (action) {
        await action.action();
      }
    }
  }

  private async showInfoNotification(message: string, options: NotificationOptions): Promise<void> {
    const actions = options.actions?.map((a) => a.label) || [];

    const selection = await vscode.window.showInformationMessage(
      message,
      { detail: options.detail },
      ...actions
    );

    if (selection) {
      const action = options.actions?.find((a) => a.label === selection);
      if (action) {
        await action.action();
      }
    }
  }

  public showToast(message: string, duration: number = 3000): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);

    statusBarItem.text = `$(info) ${message}`;
    statusBarItem.show();

    this.toastTimeout = setTimeout(() => {
      statusBarItem.dispose();
    }, duration);
  }

  private logError(error: APIError): void {
    const category = error.category;

    if (!this.errorLog.has(category)) {
      this.errorLog.set(category, []);
    }

    const categoryErrors = this.errorLog.get(category)!;
    categoryErrors.push(error);

    // Keep only recent errors
    if (categoryErrors.length > this.maxLogSize) {
      categoryErrors.shift();
    }

    this.logger.error('API Error logged', {
      category: error.category,
      code: error.code,
      message: error.message,
      requestId: error.requestContext?.requestId,
    });
  }

  public async showErrorLog(): Promise<void> {
    const quickPickItems: vscode.QuickPickItem[] = [];

    for (const [category, errors] of this.errorLog) {
      quickPickItems.push({
        label: `$(folder) ${category}`,
        kind: vscode.QuickPickItemKind.Separator,
      });

      for (const error of errors.slice(-10)) {
        // Show last 10 errors per category
        const timestamp = new Date(error.timestamp).toLocaleTimeString();
        quickPickItems.push({
          label: `${timestamp} - ${error.code}`,
          description: error.message,
          detail: error.requestContext?.requestId,
        });
      }
    }

    const selection = await vscode.window.showQuickPick(quickPickItems, {
      title: 'API Error Log',
      placeHolder: 'Select an error to view details',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selection && selection.detail) {
      // Find the full error
      for (const errors of this.errorLog.values()) {
        const error = errors.find((e) => e.requestContext?.requestId === selection.detail);
        if (error) {
          this.showErrorDetails(error);
          break;
        }
      }
    }
  }

  private async showErrorDetails(error: APIError): Promise<void> {
    const content = [
      `# API Error Details`,
      '',
      `**Code:** ${error.code}`,
      `**Category:** ${error.category}`,
      `**Time:** ${new Date(error.timestamp).toLocaleString()}`,
      `**Request ID:** ${error.requestContext?.requestId || 'N/A'}`,
      '',
      `## Message`,
      error.message,
      '',
      `## User Message`,
      error.userMessage,
      '',
    ];

    if (error.statusCode) {
      content.push(`**HTTP Status:** ${error.statusCode}`, '');
    }

    if (error.stack) {
      content.push('## Stack Trace', '```', error.stack, '```', '');
    }

    const doc = await vscode.workspace.openTextDocument({
      content: content.join('\n'),
      language: 'markdown',
    });

    await vscode.window.showTextDocument(doc, { preview: true });
  }

  public showRecoverySuggestions(error: APIError): void {
    const suggestions = this.getRecoverySuggestions(error);

    if (suggestions.length === 0) {
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'errorRecovery',
      'Recovery Suggestions',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = this.getRecoveryHtml(error, suggestions);
  }

  private getRecoverySuggestions(error: APIError): string[] {
    const suggestions: string[] = [];

    switch (error.category) {
      case ErrorCategory.NETWORK:
        suggestions.push(
          'Check your internet connection',
          'Verify proxy settings if behind a corporate firewall',
          'Try disabling VPN if connected',
          'Check if Claude API is accessible from your network'
        );
        break;

      case ErrorCategory.AUTHENTICATION:
        suggestions.push(
          'Sign out and sign back in',
          'Check if your subscription is active',
          'Verify your API key is valid',
          'Clear stored credentials and re-authenticate'
        );
        break;

      case ErrorCategory.RATE_LIMIT:
        suggestions.push(
          'Wait for rate limit to reset',
          'Reduce the frequency of requests',
          'Consider upgrading your subscription plan',
          'Enable request queueing in settings'
        );
        break;

      case ErrorCategory.SERVER:
        suggestions.push(
          'Wait a few minutes and try again',
          'Check Claude API status page',
          'Enable offline mode to use cached completions',
          'Report persistent issues to support'
        );
        break;
    }

    return suggestions;
  }

  private getRecoveryHtml(error: APIError, suggestions: string[]): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          h1 {
            color: var(--vscode-errorForeground);
          }
          .error-info {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          .suggestions {
            list-style-type: none;
            padding: 0;
          }
          .suggestions li {
            padding: 10px;
            margin-bottom: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
          }
          .suggestions li:before {
            content: "→ ";
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
          }
          .action-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin-top: 10px;
            cursor: pointer;
            border-radius: 4px;
          }
          .action-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <h1>Recovery Suggestions</h1>
        <div class="error-info">
          <strong>Error:</strong> ${error.userMessage}<br>
          <strong>Code:</strong> ${error.code}
        </div>
        <h2>Try these steps:</h2>
        <ul class="suggestions">
          ${suggestions.map((s) => `<li>${s}</li>`).join('')}
        </ul>
        <button class="action-button" onclick="vscode.postMessage({command: 'retry'})">
          Retry Request
        </button>
        <button class="action-button" onclick="vscode.postMessage({command: 'viewLog'})">
          View Error Log
        </button>
      </body>
      </html>
    `;
  }

  public clearErrorLog(category?: ErrorCategory): void {
    if (category) {
      this.errorLog.delete(category);
    } else {
      this.errorLog.clear();
    }

    this.logger.info('Error log cleared', { category });
  }

  public dispose(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.removeAllListeners();
  }
}
