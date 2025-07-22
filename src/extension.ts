import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Claude Code Continue extension is now active!');

  const disposable = vscode.commands.registerCommand('claude-code-continue.helloWorld', () => {
    vscode.window.showInformationMessage('Hello from Claude Code Continue!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  console.log('Claude Code Continue extension is now deactivated');
}