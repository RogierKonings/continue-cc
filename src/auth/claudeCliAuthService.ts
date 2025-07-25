import * as vscode from 'vscode';
import type { AuthenticationResult, UserInfo } from './authenticationService';
import { AuthenticationService } from './authenticationService';
import { AuthenticationError } from './authenticationError';
import { ClaudeCliClient } from '../api/claudeCliClient';

export class ClaudeCliAuthService extends AuthenticationService {
  private cliClient: ClaudeCliClient;

  constructor(context: vscode.ExtensionContext) {
    super(context);
    this.cliClient = new ClaudeCliClient();
  }

  async authenticate(): Promise<AuthenticationResult> {
    try {
      // Check if Claude CLI is available
      const isAvailable = await this.cliClient.checkAvailability();
      if (!isAvailable) {
        throw new AuthenticationError(
          'Claude CLI is not installed or not in PATH. Please install Claude Code CLI first.'
        );
      }

      // Test authentication
      const isAuthenticated = await this.cliClient.testAuthentication();
      if (!isAuthenticated) {
        throw new AuthenticationError(
          'Claude CLI is not authenticated. Please run "claude setup-token" to authenticate.'
        );
      }

      // Get user info
      const userInfo = await this.getUserInfo();

      const result: AuthenticationResult = {
        accessToken: 'claude-cli-authenticated', // Placeholder since CLI handles auth
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        userInfo,
      };

      // Store minimal auth state
      await this.storeTokens(result);

      return result;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Authentication failed: ${error}`);
    }
  }

  async logout(): Promise<void> {
    // Clear stored tokens
    await this.clearTokens();

    // Show info about CLI logout
    const selection = await vscode.window.showInformationMessage(
      'To fully sign out of Claude Code, you may want to revoke your CLI authentication token.',
      'Open CLI Instructions',
      'Dismiss'
    );

    if (selection === 'Open CLI Instructions') {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://docs.anthropic.com/en/docs/claude-code/cli-reference')
      );
    }
  }

  async getUserInfo(): Promise<UserInfo> {
    try {
      const userInfo = await this.cliClient.getUserInfo();

      if (!userInfo.authenticated) {
        throw new AuthenticationError('Not authenticated with Claude CLI');
      }

      return {
        id: 'claude-cli-user',
        username: userInfo.username || 'Claude Code User',
        email: userInfo.email,
        displayName: userInfo.username || 'Claude Code User',
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Failed to get user info: ${error}`);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // Check if we have stored auth state
      const storedToken = await this.getStoredToken();
      if (!storedToken) {
        return false;
      }

      // Test if CLI is still authenticated
      return await this.cliClient.testAuthentication();
    } catch {
      return false;
    }
  }

  async getAccessToken(): Promise<string | undefined> {
    const isAuth = await this.isAuthenticated();
    return isAuth ? 'claude-cli-authenticated' : undefined;
  }

  async refreshToken(): Promise<AuthenticationResult | undefined> {
    // CLI authentication doesn't need refresh - it's handled by the CLI
    const isAuth = await this.isAuthenticated();
    if (!isAuth) {
      return undefined;
    }

    // Return current auth state
    const userInfo = await this.getUserInfo();
    return {
      accessToken: 'claude-cli-authenticated',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      userInfo,
    };
  }

  /**
   * Get the CLI client for making requests
   */
  getCliClient(): ClaudeCliClient {
    return this.cliClient;
  }
}
