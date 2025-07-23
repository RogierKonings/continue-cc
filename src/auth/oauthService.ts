import * as crypto from 'crypto';
import * as http from 'http';
import { AuthenticationError } from './authenticationError';

export interface OAuthConfig {
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export class OAuthService {
  private server: http.Server | null = null;
  private currentPKCEChallenge: PKCEChallenge | null = null;

  constructor(private config: OAuthConfig) {}

  generatePKCEChallenge(): PKCEChallenge {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    this.currentPKCEChallenge = {
      codeVerifier,
      codeChallenge,
      state,
    };

    return this.currentPKCEChallenge;
  }

  private generateCodeVerifier(): string {
    const buffer = crypto.randomBytes(32);
    return buffer.toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(verifier);
    return hash.digest('base64url');
  }

  private generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  buildAuthorizationUrl(pkceChallenge: PKCEChallenge): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state: pkceChallenge.state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async startCallbackServer(): Promise<{ code: string; state: string }> {
    return new Promise((resolve, reject) => {
      const port = this.extractPortFromRedirectUri();

      this.server = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          res.writeHead(200, { 'Content-Type': 'text/html' });

          if (error) {
            res.end(`
              <html>
                <body>
                  <h2>Authentication Failed</h2>
                  <p>Error: ${error}</p>
                  <p>${errorDescription || ''}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new AuthenticationError(`OAuth error: ${error} - ${errorDescription}`));
          } else if (code && state) {
            res.end(`
              <html>
                <body>
                  <h2>Authentication Successful!</h2>
                  <p>You can close this window and return to VS Code.</p>
                </body>
              </html>
            `);
            resolve({ code, state });
          } else {
            res.end(`
              <html>
                <body>
                  <h2>Authentication Failed</h2>
                  <p>Invalid response from authorization server.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new AuthenticationError('Invalid OAuth callback response'));
          }

          this.stopCallbackServer();
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new AuthenticationError(`Port ${port} is already in use. Please try again.`));
        } else {
          reject(new AuthenticationError(`Server error: ${err.message}`));
        }
      });

      this.server.listen(port, () => {
        console.log(`OAuth callback server listening on port ${port}`);
      });
    });
  }

  stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    });

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(this.config.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: params.toString(),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);

          // Don't retry for client errors
          if (response.status >= 400 && response.status < 500) {
            throw new AuthenticationError(this.getErrorMessage(errorData, response.status));
          }

          // For server errors, save the error and try again
          lastError = new AuthenticationError(
            `Token exchange failed (attempt ${attempt}/${maxRetries}): ${response.status}`
          );

          if (attempt < maxRetries) {
            await this.delay(attempt * 1000); // Exponential backoff
            continue;
          }
        }

        const tokenResponse = (await response.json()) as TokenResponse;
        return tokenResponse;
      } catch (error) {
        if (error instanceof AuthenticationError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new AuthenticationError(
            'Token exchange timeout - please check your network connection'
          );
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
          lastError = new AuthenticationError(
            'Network error - please check your internet connection'
          );
        } else {
          lastError = new AuthenticationError(`Failed to exchange code for token: ${error}`);
        }

        if (attempt < maxRetries) {
          await this.delay(attempt * 1000);
          continue;
        }
      }
    }

    throw lastError || new AuthenticationError('Token exchange failed after multiple attempts');
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await this.parseErrorResponse(response);
        throw new AuthenticationError(this.getErrorMessage(errorData, response.status));
      }

      const tokenResponse = (await response.json()) as TokenResponse;
      return tokenResponse;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AuthenticationError(
          'Token refresh timeout - please check your network connection'
        );
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AuthenticationError('Network error - unable to refresh authentication');
      }

      throw new AuthenticationError(`Failed to refresh token: ${error}`);
    }
  }

  validateState(receivedState: string): boolean {
    if (!this.currentPKCEChallenge) {
      return false;
    }
    return receivedState === this.currentPKCEChallenge.state;
  }

  private extractPortFromRedirectUri(): number {
    const url = new URL(this.config.redirectUri);
    return parseInt(url.port) || 80;
  }

  private async parseErrorResponse(response: Response): Promise<Record<string, unknown>> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return { error: await response.text() };
    } catch {
      return { error: 'Unknown error' };
    }
  }

  private getErrorMessage(errorData: Record<string, unknown>, statusCode: number): string {
    if (typeof errorData === 'object') {
      if (errorData.error_description) {
        return errorData.error_description;
      }
      if (errorData.error) {
        switch (errorData.error) {
          case 'invalid_request':
            return 'Invalid authentication request - please try again';
          case 'unauthorized_client':
            return 'This application is not authorized - please contact support';
          case 'access_denied':
            return 'Access was denied - please grant the necessary permissions';
          case 'unsupported_response_type':
            return 'Authentication configuration error - please contact support';
          case 'invalid_scope':
            return 'Invalid permissions requested - please try again';
          case 'server_error':
            return 'Authentication server error - please try again later';
          case 'temporarily_unavailable':
            return 'Authentication service is temporarily unavailable - please try again later';
          default:
            return `Authentication error: ${errorData.error}`;
        }
      }
    }

    switch (statusCode) {
      case 400:
        return 'Invalid authentication request';
      case 401:
        return 'Authentication failed - invalid credentials';
      case 403:
        return 'Access forbidden - insufficient permissions';
      case 429:
        return 'Too many authentication attempts - please try again later';
      case 500:
      case 502:
      case 503:
        return 'Authentication service error - please try again later';
      default:
        return `Authentication failed with status ${statusCode}`;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
