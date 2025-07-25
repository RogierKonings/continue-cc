import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';

export class GeneralCommands {
  private logger: Logger;
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext) {
    this.logger = new Logger('GeneralCommands');
    this.outputChannel = vscode.window.createOutputChannel('Claude Code Continue');
    this.registerCommands();
  }

  private registerCommands(): void {
    // Show Usage Statistics
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.showUsageStatistics', () => {
        this.showUsageStatistics();
      })
    );

    // Show Debug Information
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.showDebugInfo', () => {
        this.showDebugInfo();
      })
    );

    // Analyze File
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.analyzeFile', async (uri: vscode.Uri) => {
        await this.analyzeFile(uri);
      })
    );
  }

  private async showUsageStatistics(): Promise<void> {
    // Retrieve stored statistics
    const stats = this.context.globalState.get<any>('continue-cc.usageStats', {
      totalCompletions: 0,
      acceptedCompletions: 0,
      totalTokens: 0,
      sessionCount: 0,
      lastReset: new Date().toISOString(),
    });

    const acceptRate =
      stats.totalCompletions > 0
        ? ((stats.acceptedCompletions / stats.totalCompletions) * 100).toFixed(1)
        : '0';

    const panel = vscode.window.createWebviewPanel(
      'claudeCodeStats',
      'Claude Code Usage Statistics',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = this.getUsageStatsHtml(stats, acceptRate);
  }

  private getUsageStatsHtml(stats: any, acceptRate: string): string {
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
          .stat-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
          }
          .stat-title {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-foreground);
          }
          .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
          }
          h1 {
            color: var(--vscode-foreground);
            margin-bottom: 24px;
          }
          .reset-info {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>📊 Claude Code Usage Statistics</h1>
        
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-title">Total Completions</div>
            <div class="stat-value">${stats.totalCompletions}</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-title">Accepted Completions</div>
            <div class="stat-value">${stats.acceptedCompletions}</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-title">Acceptance Rate</div>
            <div class="stat-value">${acceptRate}%</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-title">Total Tokens Used</div>
            <div class="stat-value">${stats.totalTokens}</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-title">Sessions</div>
            <div class="stat-value">${stats.sessionCount}</div>
          </div>
        </div>
        
        <div class="reset-info">
          Statistics since: ${new Date(stats.lastReset).toLocaleString()}
        </div>
      </body>
      </html>
    `;
  }

  private showDebugInfo(): void {
    this.outputChannel.clear();
    this.outputChannel.show();

    // Show debug information
    this.outputChannel.appendLine('=== Claude Code Continue Debug Information ===');
    this.outputChannel.appendLine(
      `Extension Version: ${this.context.extension.packageJSON.version}`
    );
    this.outputChannel.appendLine(`VS Code Version: ${vscode.version}`);
    this.outputChannel.appendLine(`Platform: ${process.platform}`);
    this.outputChannel.appendLine(`Node Version: ${process.version}`);
    this.outputChannel.appendLine('');

    // Configuration
    const config = vscode.workspace.getConfiguration('continue-cc');
    this.outputChannel.appendLine('=== Configuration ===');
    this.outputChannel.appendLine(JSON.stringify(config, null, 2));
    this.outputChannel.appendLine('');

    // Authentication Status
    const isAuthenticated = this.context.globalState.get<boolean>(
      'claude-code.authenticated',
      false
    );
    this.outputChannel.appendLine('=== Authentication ===');
    this.outputChannel.appendLine(`Authenticated: ${isAuthenticated}`);

    if (isAuthenticated) {
      const tokenExpiry = this.context.globalState.get<string>('claude-code.tokenExpiry');
      if (tokenExpiry) {
        this.outputChannel.appendLine(`Token Expires: ${new Date(tokenExpiry).toLocaleString()}`);
      }
    }
    this.outputChannel.appendLine('');

    // Recent Logs
    this.outputChannel.appendLine('=== Recent Logs ===');
    // Here you would append actual log entries if you have a logging system
    this.outputChannel.appendLine('(Enable verbose logging in settings to see detailed logs)');
  }

  private async analyzeFile(uri: vscode.Uri): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);

      // Basic file analysis
      const lines = document.lineCount;
      const text = document.getText();
      const words = text.split(/\s+/).length;
      const characters = text.length;

      // Language specific analysis could be added here
      const language = document.languageId;

      const message = `
File Analysis: ${path.basename(uri.fsPath)}

📄 Basic Metrics:
- Lines: ${lines}
- Words: ${words}
- Characters: ${characters}
- Language: ${language}

💡 This is where Claude Code would provide intelligent analysis of your code structure, patterns, and suggestions.
      `.trim();

      vscode.window.showInformationMessage(message, { modal: true });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to analyze file: ${error}`);
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
