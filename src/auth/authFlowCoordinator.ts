import * as vscode from 'vscode';
import { AuthenticationService } from './authenticationService';
import { AuthenticationError } from './authenticationError';

export class AuthFlowCoordinator {
  constructor(
    private readonly authService: AuthenticationService,
    private readonly context: vscode.ExtensionContext
  ) {}

  async startLoginFlow(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Claude Code Authentication',
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Initializing authentication...' });
          
          token.onCancellationRequested(() => {
            throw new AuthenticationError('Authentication cancelled by user');
          });

          progress.report({ increment: 30, message: 'Opening authentication page...' });
          
          const authResult = await this.authService.authenticate();
          
          progress.report({ increment: 50, message: 'Verifying credentials...' });
          
          const userInfo = await this.authService.getUserInfo();
          
          progress.report({ increment: 20, message: 'Authentication successful!' });
          
          await this.showSuccessMessage(userInfo);
          
          return authResult;
        }
      );
    } catch (error) {
      this.handleAuthenticationError(error);
    }
  }

  async startLogoutFlow(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to sign out of Claude Code?',
      'Sign Out',
      'Cancel'
    );

    if (confirm === 'Sign Out') {
      try {
        await this.authService.logout();
        vscode.window.showInformationMessage('Successfully signed out of Claude Code');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to sign out: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async showSuccessMessage(userInfo: { email?: string; username?: string }): Promise<void> {
    const displayName = userInfo.email || userInfo.username || 'User';
    vscode.window.showInformationMessage(
      `Welcome to Claude Code, ${displayName}!`,
      'Open Documentation',
      'Dismiss'
    ).then(selection => {
      if (selection === 'Open Documentation') {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.anthropic.com/claude-code'));
      }
    });
  }

  private handleAuthenticationError(error: unknown): void {
    if (error instanceof AuthenticationError) {
      vscode.window.showErrorMessage(
        error.message,
        'Try Again'
      ).then(selection => {
        if (selection === 'Try Again') {
          this.startLoginFlow();
        }
      });
    } else {
      vscode.window.showErrorMessage(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}