import * as vscode from 'vscode';
import type { AuthenticationService } from '../auth/authenticationService';

export class AuthStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private updateInterval?: NodeJS.Timeout;

  constructor(
    private readonly authService: AuthenticationService,
    private readonly context: vscode.ExtensionContext
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    this.statusBarItem.command = 'claude-code-continue.showAuthMenu';
    this.context.subscriptions.push(this.statusBarItem);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.updateStatus();
    this.statusBarItem.show();

    // Update status every minute to check token expiry
    this.updateInterval = setInterval(() => {
      this.updateStatus();
    }, 60000);

    this.context.subscriptions.push({
      dispose: () => {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
        }
      },
    });
  }

  async updateStatus(): Promise<void> {
    const isAuthenticated = await this.authService.isAuthenticated();

    if (isAuthenticated) {
      await this.showAuthenticatedStatus();
    } else {
      this.showUnauthenticatedStatus();
    }
  }

  private async showAuthenticatedStatus(): Promise<void> {
    try {
      const userInfo = await this.authService.getUserInfo();
      const displayName = userInfo.email || userInfo.username || 'User';

      const tokenExpiry = this.context.globalState.get<string>('claude-code.tokenExpiry');
      const isExpiringSoon = this.checkIfExpiringSoon(tokenExpiry);

      this.statusBarItem.text = `$(account) ${displayName}`;

      if (isExpiringSoon) {
        this.statusBarItem.text = `$(warning) ${displayName}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        this.statusBarItem.tooltip = new vscode.MarkdownString(
          '**Claude Code - Session Expiring Soon**\n\n' +
            `User: ${displayName}\n\n` +
            '⚠️ Your session will expire soon. Click to refresh.'
        );
      } else {
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = new vscode.MarkdownString(
          '**Claude Code - Authenticated**\n\n' +
            `User: ${displayName}\n\n` +
            'Click to manage your session'
        );
      }
    } catch {
      this.showErrorStatus();
    }
  }

  private showUnauthenticatedStatus(): void {
    this.statusBarItem.text = '$(sign-in) Sign In to Claude Code';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      '**Claude Code - Not Authenticated**\n\n' + 'Click to sign in and start using Claude Code'
    );
  }

  private showErrorStatus(): void {
    this.statusBarItem.text = '$(error) Claude Code Error';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      '**Claude Code - Error**\n\n' +
        'There was an error checking your authentication status.\n' +
        'Click to try again.'
    );
  }

  private checkIfExpiringSoon(tokenExpiry?: string): boolean {
    if (!tokenExpiry) {
      return false;
    }

    const expiryDate = new Date(tokenExpiry);
    const now = new Date();
    const hoursUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntilExpiry <= 24 && hoursUntilExpiry > 0;
  }

  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.statusBarItem.dispose();
  }
}
