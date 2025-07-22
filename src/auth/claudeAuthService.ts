import * as vscode from 'vscode';
import { AuthenticationService, AuthenticationResult, UserInfo } from './authenticationService';
import { AuthenticationError } from './authenticationError';
import { AuthWebviewProvider } from '../webviews/authWebviewProvider';

export class ClaudeAuthService extends AuthenticationService {
  private authWebviewProvider: AuthWebviewProvider;

  constructor(context: vscode.ExtensionContext) {
    super(context);
    this.authWebviewProvider = new AuthWebviewProvider(context);
  }

  async authenticate(): Promise<AuthenticationResult> {
    const selection = await vscode.window.showQuickPick(
      ['Browser Authentication', 'Manual Token Entry'],
      {
        placeHolder: 'Choose authentication method',
        title: 'Claude Code Authentication'
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
    const authUrl = 'https://auth.anthropic.com/oauth/authorize';
    const clientId = vscode.workspace.getConfiguration('claude-code').get<string>('clientId') || 'default-client-id';
    const redirectUri = `vscode://claude-code-continue/auth-callback`;
    
    const state = this.generateState();
    await this.context.globalState.update('claude-code.authState', state);
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: state,
      scope: 'read write'
    });

    const fullAuthUrl = `${authUrl}?${params.toString()}`;
    
    await vscode.env.openExternal(vscode.Uri.parse(fullAuthUrl));
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new AuthenticationError('Authentication timeout'));
      }, 300000); // 5 minutes

      const disposable = vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
          if (uri.path === '/auth-callback') {
            clearTimeout(timeout);
            disposable.dispose();
            
            try {
              const result = await this.handleAuthCallback(uri);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        }
      });
    });
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
      userInfo
    };

    await this.storeTokens(result);
    return result;
  }

  private async handleAuthCallback(uri: vscode.Uri): Promise<AuthenticationResult> {
    const query = new URLSearchParams(uri.query);
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');

    if (error) {
      throw new AuthenticationError(`Authentication failed: ${error}`);
    }

    const savedState = this.context.globalState.get<string>('claude-code.authState');
    if (state !== savedState) {
      throw new AuthenticationError('Invalid state parameter - possible security issue');
    }

    if (!code) {
      throw new AuthenticationError('No authorization code received');
    }

    return this.exchangeCodeForToken(code);
  }

  private async exchangeCodeForToken(code: string): Promise<AuthenticationResult> {
    // This would make an API call to exchange the code for tokens
    // For now, returning a mock result
    const mockToken = 'mock-access-token';
    const userInfo = await this.validateTokenAndGetUserInfo(mockToken);
    
    const result: AuthenticationResult = {
      accessToken: mockToken,
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      userInfo
    };

    await this.storeTokens(result);
    return result;
  }

  private async validateTokenAndGetUserInfo(token: string): Promise<UserInfo> {
    // This would validate the token with the API
    // For now, returning mock user info
    return {
      id: 'user-123',
      email: 'user@example.com',
      username: 'claude-user',
      displayName: 'Claude User'
    };
  }

  async logout(): Promise<void> {
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
    const token = await this.getStoredToken();
    return !!token;
  }

  async getAccessToken(): Promise<string | undefined> {
    return this.getStoredToken();
  }

  async refreshToken(): Promise<AuthenticationResult | undefined> {
    const refreshToken = await this.context.secrets.get('claude-code.refreshToken');
    if (!refreshToken) {
      return undefined;
    }

    // This would make an API call to refresh the token
    // For now, returning undefined
    return undefined;
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}