import * as vscode from 'vscode';
import type { AuthenticationResult, UserInfo } from './authenticationService';
import { AuthenticationService } from './authenticationService';
import { AuthenticationError } from './authenticationError';
import { AuthWebviewProvider } from '../webviews/authWebviewProvider';
import type { OAuthConfig } from './oauthService';
import { OAuthService } from './oauthService';
import { TokenManager } from './tokenManager';

export class ClaudeAuthService extends AuthenticationService {
  private authWebviewProvider: AuthWebviewProvider;
  private oauthService: OAuthService;
  private authTimeout: NodeJS.Timeout | null = null;
  private tokenManager: TokenManager;

  constructor(context: vscode.ExtensionContext) {
    super(context);
    this.authWebviewProvider = new AuthWebviewProvider(context);

    const config = vscode.workspace.getConfiguration('claude-code');
    const oauthConfig: OAuthConfig = {
      clientId: config.get<string>('clientId') || 'claude-code-vscode',
      authorizationUrl: 'https://auth.anthropic.com/oauth/authorize',
      tokenUrl: 'https://auth.anthropic.com/oauth/token',
      redirectUri: 'http://127.0.0.1:54321/callback',
      scopes: ['read', 'write', 'profile'],
    };

    this.oauthService = new OAuthService(oauthConfig);

    this.tokenManager = new TokenManager(context, () => this.refreshToken());

    // Start auto-refresh when extension activates
    this.tokenManager.startAutoRefresh();
  }

  async authenticate(): Promise<AuthenticationResult> {
    const selection = await vscode.window.showQuickPick(
      ['Browser Authentication', 'Manual Token Entry'],
      {
        placeHolder: 'Choose authentication method',
        title: 'Claude Code Authentication',
      }
    );

    if (!selection) {
      throw new AuthenticationError('Authentication cancelled');
    }

    if (selection === 'Browser Authentication') {
      return this.authenticateViaBrowser();
    } else {
      return this.authenticateViaManualEntry();
    }
  }

  private async authenticateViaBrowser(): Promise<AuthenticationResult> {
    try {
      // Generate PKCE challenge
      const pkceChallenge = this.oauthService.generatePKCEChallenge();

      // Store PKCE verifier for later use
      await this.context.globalState.update('claude-code.pkceVerifier', pkceChallenge.codeVerifier);

      // Build authorization URL with PKCE
      const authUrl = this.oauthService.buildAuthorizationUrl(pkceChallenge);

      // Start callback server
      const callbackPromise = this.oauthService.startCallbackServer();

      // Open browser
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      // Show progress notification
      const progressPromise = vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Claude Code Authentication',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Waiting for authentication in browser...' });

          // Set up timeout
          this.authTimeout = setTimeout(() => {
            this.oauthService.stopCallbackServer();
            throw new AuthenticationError('Authentication timeout');
          }, 300000); // 5 minutes

          token.onCancellationRequested(() => {
            this.oauthService.stopCallbackServer();
            if (this.authTimeout) {
              clearTimeout(this.authTimeout);
            }
          });

          return callbackPromise;
        }
      );

      // Wait for callback
      const { code, state } = await progressPromise;

      // Clear timeout
      if (this.authTimeout) {
        clearTimeout(this.authTimeout);
        this.authTimeout = null;
      }

      // Validate state
      if (!this.oauthService.validateState(state)) {
        throw new AuthenticationError('Invalid state parameter - possible security issue');
      }

      // Exchange code for token
      const tokenResponse = await this.oauthService.exchangeCodeForToken(
        code,
        pkceChallenge.codeVerifier
      );

      // Get user info
      const userInfo = await this.getUserInfoFromToken(tokenResponse.access_token);

      // Create result
      const result: AuthenticationResult = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        userInfo,
      };

      // Store tokens
      await this.storeTokens(result);

      // Clean up
      await this.context.globalState.update('claude-code.pkceVerifier', undefined);

      return result;
    } catch (error) {
      // Clean up on error
      this.oauthService.stopCallbackServer();
      if (this.authTimeout) {
        clearTimeout(this.authTimeout);
        this.authTimeout = null;
      }

      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Authentication failed: ${error}`);
    }
  }

  private async authenticateViaManualEntry(): Promise<AuthenticationResult> {
    const token = await this.authWebviewProvider.showTokenEntryWebview();

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const userInfo = await this.validateTokenAndGetUserInfo(token);

    const result: AuthenticationResult = {
      accessToken: token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      userInfo,
    };

    await this.storeTokens(result);
    return result;
  }

  private async getUserInfoFromToken(accessToken: string): Promise<UserInfo> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new AuthenticationError(`Failed to get user info: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        id: String(data.id || ''),
        email: data.email ? String(data.email) : undefined,
        username: data.username ? String(data.username) : undefined,
        displayName: data.display_name
          ? String(data.display_name)
          : data.name
            ? String(data.name)
            : undefined,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Failed to get user info: ${error}`);
    }
  }

  private async validateTokenAndGetUserInfo(token: string): Promise<UserInfo> {
    return this.getUserInfoFromToken(token);
  }

  async logout(): Promise<void> {
    // Stop auto-refresh
    this.tokenManager.stopAutoRefresh();

    // Revoke token if available
    const token = await this.getAccessToken();
    if (token) {
      await this.tokenManager.revokeToken(token);
    }

    // Clear stored tokens
    await this.clearTokens();
  }

  async getUserInfo(): Promise<UserInfo> {
    const userInfo = this.context.globalState.get<UserInfo>('claude-code.userInfo');
    if (!userInfo) {
      throw new AuthenticationError('Not authenticated');
    }
    return userInfo;
  }

  async isAuthenticated(): Promise<boolean> {
    const validation = await this.tokenManager.validateStoredToken();

    if (validation.needsRefresh) {
      // Try to refresh the token
      const refreshed = await this.refreshToken();
      return !!refreshed;
    }

    return validation.isValid;
  }

  async getAccessToken(): Promise<string | undefined> {
    return this.getStoredToken();
  }

  async refreshToken(): Promise<AuthenticationResult | undefined> {
    const refreshToken = await this.context.secrets.get('claude-code.refreshToken');
    if (!refreshToken) {
      return undefined;
    }

    try {
      const tokenResponse = await this.oauthService.refreshAccessToken(refreshToken);
      const userInfo = await this.getUserInfoFromToken(tokenResponse.access_token);

      const result: AuthenticationResult = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        userInfo,
      };

      await this.storeTokens(result);
      return result;
    } catch {
      // If refresh fails, clear tokens and return undefined
      await this.clearTokens();
      return undefined;
    }
  }
}
