import * as vscode from 'vscode';
import type { AuthenticationService } from '../auth/authenticationService';

export enum ExtensionStatus {
  INITIALIZING = 'Initializing...',
  READY = 'Ready',
  LOADING = 'Loading...',
  ERROR = 'Error',
  RATE_LIMITED = 'Rate Limited',
  OFFLINE = 'Offline',
  DISABLED = 'Disabled',
}

export interface UsageStats {
  totalCompletions: number;
  acceptedCompletions: number;
  rejectedCompletions: number;
  totalTokens: number;
  sessionStartTime: Date;
}

export class StatusBarService {
  private authStatusItem: vscode.StatusBarItem;
  private extensionStatusItem: vscode.StatusBarItem;
  private usageStatusItem: vscode.StatusBarItem;
  private currentStatus: ExtensionStatus = ExtensionStatus.INITIALIZING;
  private loadingTimeout?: NodeJS.Timeout;
  private usageStats: UsageStats;

  constructor(
    private readonly authService: AuthenticationService,
    private readonly context: vscode.ExtensionContext
  ) {
    // Auth status (rightmost)
    this.authStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.authStatusItem.command = 'claude-code-continue.showAuthMenu';

    // Extension status
    this.extensionStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.extensionStatusItem.command = 'continue-cc.showStatusMenu';

    // Usage statistics
    this.usageStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.usageStatusItem.command = 'continue-cc.showUsageStatistics';

    // Load usage stats
    this.usageStats = this.context.globalState.get<UsageStats>('continue-cc.usageStats', {
      totalCompletions: 0,
      acceptedCompletions: 0,
      rejectedCompletions: 0,
      totalTokens: 0,
      sessionStartTime: new Date(),
    });

    this.context.subscriptions.push(
      this.authStatusItem,
      this.extensionStatusItem,
      this.usageStatusItem
    );

    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.updateAuthStatus();
    this.setExtensionStatus(ExtensionStatus.READY);
    this.updateUsageStatus();

    this.authStatusItem.show();
    this.extensionStatusItem.show();
    this.usageStatusItem.show();

    // Register status menu command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.showStatusMenu', () => {
        this.showStatusMenu();
      })
    );

    // Update auth status periodically
    const updateInterval = setInterval(() => {
      this.updateAuthStatus();
    }, 60000);

    this.context.subscriptions.push({
      dispose: () => clearInterval(updateInterval),
    });
  }

  public setExtensionStatus(status: ExtensionStatus): void {
    this.currentStatus = status;
    this.updateExtensionStatusBar();
  }

  public async showLoading(message: string = 'Loading...'): Promise<void> {
    // Clear any existing loading timeout
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }

    this.setExtensionStatus(ExtensionStatus.LOADING);
    this.extensionStatusItem.text = `$(sync~spin) ${message}`;

    // Auto-clear loading after 30 seconds to prevent stuck states
    this.loadingTimeout = setTimeout(() => {
      if (this.currentStatus === ExtensionStatus.LOADING) {
        this.setExtensionStatus(ExtensionStatus.READY);
      }
    }, 30000);
  }

  public hideLoading(): void {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = undefined;
    }

    if (this.currentStatus === ExtensionStatus.LOADING) {
      this.setExtensionStatus(ExtensionStatus.READY);
    }
  }

  public incrementCompletions(accepted: boolean, tokens: number = 0): void {
    this.usageStats.totalCompletions++;
    if (accepted) {
      this.usageStats.acceptedCompletions++;
    } else {
      this.usageStats.rejectedCompletions++;
    }
    this.usageStats.totalTokens += tokens;

    // Save stats
    this.context.globalState.update('continue-cc.usageStats', this.usageStats);
    this.updateUsageStatus();
  }

  public async updateAuthStatus(): Promise<void> {
    const isAuthenticated = await this.authService.isAuthenticated();

    if (isAuthenticated) {
      try {
        const userInfo = await this.authService.getUserInfo();
        const displayName = userInfo.email || userInfo.username || 'User';

        this.authStatusItem.text = `$(account) ${displayName}`;
        this.authStatusItem.backgroundColor = undefined;
        this.authStatusItem.tooltip = new vscode.MarkdownString(
          '**Claude Code - Authenticated**\n\n' +
            `User: ${displayName}\n\n` +
            'Click to manage your session'
        );
      } catch {
        this.showAuthError();
      }
    } else {
      this.authStatusItem.text = '$(sign-in) Sign In';
      this.authStatusItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      this.authStatusItem.tooltip = new vscode.MarkdownString(
        '**Claude Code - Not Authenticated**\n\n' + 'Click to sign in and start using Claude Code'
      );
    }
  }

  private updateExtensionStatusBar(): void {
    const config = vscode.workspace.getConfiguration('continue-cc');
    const isEnabled = config.get<boolean>('enable', true);

    if (!isEnabled) {
      this.extensionStatusItem.text = '$(circle-slash) Claude Code';
      this.extensionStatusItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      this.extensionStatusItem.tooltip = 'Claude Code is disabled';
      return;
    }

    switch (this.currentStatus) {
      case ExtensionStatus.INITIALIZING:
        this.extensionStatusItem.text = '$(sync~spin) Initializing...';
        this.extensionStatusItem.backgroundColor = undefined;
        this.extensionStatusItem.tooltip = 'Claude Code is starting up';
        break;

      case ExtensionStatus.READY:
        this.extensionStatusItem.text = '$(check) Claude Code';
        this.extensionStatusItem.backgroundColor = undefined;
        this.extensionStatusItem.tooltip = 'Claude Code is ready';
        break;

      case ExtensionStatus.LOADING:
        // Loading state is handled by showLoading()
        break;

      case ExtensionStatus.ERROR:
        this.extensionStatusItem.text = '$(error) Claude Code';
        this.extensionStatusItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        this.extensionStatusItem.tooltip = 'Claude Code encountered an error';
        break;

      case ExtensionStatus.RATE_LIMITED:
        this.extensionStatusItem.text = '$(warning) Rate Limited';
        this.extensionStatusItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        this.extensionStatusItem.tooltip =
          'API rate limit reached. Please wait before trying again.';
        break;

      case ExtensionStatus.OFFLINE:
        this.extensionStatusItem.text = '$(cloud-offline) Offline';
        this.extensionStatusItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        this.extensionStatusItem.tooltip = 'No internet connection';
        break;
    }
  }

  private updateUsageStatus(): void {
    const acceptRate =
      this.usageStats.totalCompletions > 0
        ? Math.round((this.usageStats.acceptedCompletions / this.usageStats.totalCompletions) * 100)
        : 0;

    this.usageStatusItem.text = `$(graph) ${acceptRate}%`;
    this.usageStatusItem.tooltip = new vscode.MarkdownString(
      '**Claude Code Usage**\n\n' +
        `Total Completions: ${this.usageStats.totalCompletions}\n` +
        `Accepted: ${this.usageStats.acceptedCompletions}\n` +
        `Acceptance Rate: ${acceptRate}%\n\n` +
        'Click for detailed statistics'
    );
  }

  private showAuthError(): void {
    this.authStatusItem.text = '$(error) Auth Error';
    this.authStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.authStatusItem.tooltip = new vscode.MarkdownString(
      '**Claude Code - Authentication Error**\n\n' +
        'There was an error checking your authentication status.\n' +
        'Click to try again.'
    );
  }

  private async showStatusMenu(): Promise<void> {
    const config = vscode.workspace.getConfiguration('continue-cc');
    const isEnabled = config.get<boolean>('enable', true);

    const items: vscode.QuickPickItem[] = [
      {
        label: `$(${isEnabled ? 'check' : 'circle-slash'}) Extension ${isEnabled ? 'Enabled' : 'Disabled'}`,
        description: 'Toggle extension on/off',
      },
      {
        label: '$(gear) Open Settings',
        description: 'Configure Claude Code',
      },
      {
        label: '$(graph) View Usage Statistics',
        description: `${this.usageStats.totalCompletions} completions this session`,
      },
      {
        label: '$(trash) Clear Cache',
        description: 'Clear completion cache',
      },
      {
        label: '$(debug) Show Debug Info',
        description: 'View debug information',
      },
    ];

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'Claude Code Status',
    });

    if (selection) {
      if (selection.label.includes('Extension')) {
        await vscode.commands.executeCommand('continue-cc.toggle');
      } else if (selection.label.includes('Settings')) {
        await vscode.commands.executeCommand('continue-cc.openSettings');
      } else if (selection.label.includes('Statistics')) {
        await vscode.commands.executeCommand('continue-cc.showUsageStatistics');
      } else if (selection.label.includes('Cache')) {
        await vscode.commands.executeCommand('continue-cc.clearCompletionCache');
      } else if (selection.label.includes('Debug')) {
        await vscode.commands.executeCommand('continue-cc.showDebugInfo');
      }
    }
  }

  public resetUsageStats(): void {
    this.usageStats = {
      totalCompletions: 0,
      acceptedCompletions: 0,
      rejectedCompletions: 0,
      totalTokens: 0,
      sessionStartTime: new Date(),
    };
    this.context.globalState.update('continue-cc.usageStats', this.usageStats);
    this.updateUsageStatus();
  }

  public getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  public dispose(): void {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }
  }
}
