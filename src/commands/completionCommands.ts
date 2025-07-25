import * as vscode from 'vscode';
import type { CompletionProviderRegistry } from '../autocomplete/completionProviderRegistry';

export class CompletionCommands {
  private isEnabled = true;
  private completionVisible = false;

  constructor(
    private context: vscode.ExtensionContext,
    private completionRegistry: CompletionProviderRegistry
  ) {
    this.registerCommands();
    this.updateCompletionContext();
  }

  private registerCommands(): void {
    // Accept Completion
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.acceptCompletion', async () => {
        if (this.completionVisible) {
          await vscode.commands.executeCommand('acceptSelectedSuggestion');
          this.setCompletionVisible(false);
        }
      })
    );

    // Dismiss Completion
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.dismissCompletion', async () => {
        if (this.completionVisible) {
          await vscode.commands.executeCommand('hideSuggestWidget');
          this.setCompletionVisible(false);
        }
      })
    );

    // Trigger Completion
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.triggerCompletion', async () => {
        if (this.isEnabled) {
          await vscode.commands.executeCommand('editor.action.triggerSuggest');
        }
      })
    );

    // Toggle Extension
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.toggle', () => {
        this.isEnabled = !this.isEnabled;
        const status = this.isEnabled ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Claude Code Continue is now ${status}`);

        // Update configuration
        vscode.workspace
          .getConfiguration('continue-cc.autocomplete')
          .update('enabled', this.isEnabled, vscode.ConfigurationTarget.Global);
      })
    );

    // Next Completion
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.nextCompletion', async () => {
        if (this.completionVisible) {
          await vscode.commands.executeCommand('selectNextSuggestion');
        }
      })
    );

    // Previous Completion
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.previousCompletion', async () => {
        if (this.completionVisible) {
          await vscode.commands.executeCommand('selectPrevSuggestion');
        }
      })
    );

    // Show Completion Metrics
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.showCompletionMetrics', () => {
        this.showCompletionMetrics();
      })
    );

    // Clear Completion Cache
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.clearCompletionCache', () => {
        // TODO: Implement cache clearing when cache is implemented
        vscode.window.showInformationMessage('Completion cache cleared');
      })
    );

    // Listen for completion widget visibility changes
    this.context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        // This is a simplified check - in a real implementation you'd check
        // if the suggest widget is actually visible
        this.updateCompletionContext();
      })
    );
  }

  private setCompletionVisible(visible: boolean): void {
    this.completionVisible = visible;
    vscode.commands.executeCommand('setContext', 'continue-cc.completionVisible', visible);
  }

  private updateCompletionContext(): void {
    // Update context for when clauses
    vscode.commands.executeCommand(
      'setContext',
      'continue-cc.completionVisible',
      this.completionVisible
    );
  }

  private showCompletionMetrics(): void {
    // TODO: Implement actual metrics tracking
    const metrics = {
      totalCompletions: 0,
      acceptedCompletions: 0,
      rejectedCompletions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,
    };

    const message = `
Completion Metrics:
- Total Completions: ${metrics.totalCompletions}
- Accepted: ${metrics.acceptedCompletions}
- Rejected: ${metrics.rejectedCompletions}
- Cache Hit Rate: ${metrics.cacheHits}/${metrics.cacheHits + metrics.cacheMisses}
- Average Latency: ${metrics.averageLatency}ms
    `.trim();

    vscode.window.showInformationMessage(message, { modal: true });
  }
}
