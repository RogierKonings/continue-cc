import * as vscode from 'vscode';
import type { AuthenticationResult } from './authenticationService';
import { AuthenticationError } from './authenticationError';

export interface TokenValidationResult {
  isValid: boolean;
  needsRefresh: boolean;
  expiresAt?: Date;
}

export class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onTokenRefresh: () => Promise<AuthenticationResult | undefined>
  ) {}

  async validateStoredToken(): Promise<TokenValidationResult> {
    const token = await this.context.secrets.get('claude-code.accessToken');
    const expiryString = this.context.globalState.get<string>('claude-code.tokenExpiry');

    if (!token || !expiryString) {
      return { isValid: false, needsRefresh: false };
    }

    const expiresAt = new Date(expiryString);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    if (timeUntilExpiry <= 0) {
      // Token has expired
      return { isValid: false, needsRefresh: true };
    }

    if (timeUntilExpiry <= this.TOKEN_REFRESH_BUFFER_MS) {
      // Token is about to expire
      return { isValid: true, needsRefresh: true, expiresAt };
    }

    // Token is valid
    return { isValid: true, needsRefresh: false, expiresAt };
  }

  async startAutoRefresh(): Promise<void> {
    // Clear any existing timer
    this.stopAutoRefresh();

    const validation = await this.validateStoredToken();
    if (!validation.isValid && !validation.needsRefresh) {
      // No token to refresh
      return;
    }

    if (validation.needsRefresh) {
      // Refresh immediately
      await this.performTokenRefresh();
    }

    // Schedule next refresh
    if (validation.expiresAt) {
      const timeUntilRefresh =
        validation.expiresAt.getTime() - new Date().getTime() - this.TOKEN_REFRESH_BUFFER_MS;

      if (timeUntilRefresh > 0) {
        this.refreshTimer = setTimeout(async () => {
          await this.performTokenRefresh();
          // Reschedule after successful refresh
          await this.startAutoRefresh();
        }, timeUntilRefresh);
      }
    }
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async performTokenRefresh(): Promise<void> {
    try {
      const result = await this.onTokenRefresh();
      if (!result) {
        throw new AuthenticationError('Token refresh failed');
      }

      // Show status bar notification
      vscode.window.setStatusBarMessage('Claude Code: Session refreshed', 5000);
    } catch (error) {
      console.error('Failed to refresh token:', error);

      // Notify user that they need to re-authenticate
      const selection = await vscode.window.showWarningMessage(
        'Your Claude Code session has expired. Please sign in again.',
        'Sign In',
        'Dismiss'
      );

      if (selection === 'Sign In') {
        await vscode.commands.executeCommand('claude-code-continue.signIn');
      }
    }
  }

  async revokeToken(accessToken: string): Promise<void> {
    try {
      const response = await fetch('https://auth.anthropic.com/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
        }).toString(),
      });

      if (!response.ok && response.status !== 200) {
        console.error('Failed to revoke token:', response.status);
      }
    } catch (error) {
      console.error('Error revoking token:', error);
    }
  }

  async getValidToken(): Promise<string | undefined> {
    const validation = await this.validateStoredToken();

    if (!validation.isValid && validation.needsRefresh) {
      // Try to refresh
      await this.performTokenRefresh();
      // Re-validate after refresh
      const newValidation = await this.validateStoredToken();
      if (!newValidation.isValid) {
        return undefined;
      }
    } else if (!validation.isValid) {
      return undefined;
    }

    return await this.context.secrets.get('claude-code.accessToken');
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete('claude-code.accessToken');
    await this.context.globalState.update('claude-code.tokenExpiry', undefined);
    this.stopAutoRefresh();
  }
}
