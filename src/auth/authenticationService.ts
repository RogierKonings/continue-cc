import * as vscode from 'vscode';

export interface UserInfo {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
}

export interface AuthenticationResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  userInfo: UserInfo;
}

export abstract class AuthenticationService {
  protected readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  abstract authenticate(): Promise<AuthenticationResult>;
  abstract logout(): Promise<void>;
  abstract getUserInfo(): Promise<UserInfo>;
  abstract isAuthenticated(): Promise<boolean>;
  abstract getAccessToken(): Promise<string | undefined>;
  abstract refreshToken(): Promise<AuthenticationResult | undefined>;

  protected async storeTokens(result: AuthenticationResult): Promise<void> {
    await this.context.secrets.store('claude-code.accessToken', result.accessToken);
    if (result.refreshToken) {
      await this.context.secrets.store('claude-code.refreshToken', result.refreshToken);
    }
    await this.context.globalState.update(
      'claude-code.tokenExpiry',
      result.expiresAt.toISOString()
    );
    await this.context.globalState.update('claude-code.userInfo', result.userInfo);
  }

  protected async clearTokens(): Promise<void> {
    await this.context.secrets.delete('claude-code.accessToken');
    await this.context.secrets.delete('claude-code.refreshToken');
    await this.context.globalState.update('claude-code.tokenExpiry', undefined);
    await this.context.globalState.update('claude-code.userInfo', undefined);
  }

  protected async getStoredToken(): Promise<string | undefined> {
    const token = await this.context.secrets.get('claude-code.accessToken');
    const expiry = this.context.globalState.get<string>('claude-code.tokenExpiry');

    if (!token || !expiry) {
      return undefined;
    }

    const expiryDate = new Date(expiry);
    if (expiryDate <= new Date()) {
      await this.clearTokens();
      return undefined;
    }

    return token;
  }
}
