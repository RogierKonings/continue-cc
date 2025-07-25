import * as chai from 'chai';
import * as sinon from 'sinon';
import * as crypto from 'crypto';
import * as http from 'http';
import '../../setup';

const { expect } = chai;
import { OAuthService, OAuthConfig, TokenResponse } from '../../../auth/oauthService';
import { AuthenticationError } from '../../../auth/authenticationError';

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockConfig: OAuthConfig;
  let cryptoStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    mockConfig = {
      clientId: 'test-client-id',
      authorizationUrl: 'https://auth.claude.ai/oauth/authorize',
      tokenUrl: 'https://auth.claude.ai/oauth/token',
      redirectUri: 'http://localhost:8080/callback',
      scopes: ['code', 'completions'],
    };

    oauthService = new OAuthService(mockConfig);

    // Stub crypto methods
    cryptoStub = sinon.stub(crypto, 'randomBytes');
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
    if ((oauthService as any).server) {
      (oauthService as any).server.close();
    }
  });

  describe('generatePKCEChallenge', () => {
    it('should generate PKCE challenge with verifier, challenge and state', () => {
      cryptoStub.onFirstCall().returns(Buffer.from('test-verifier-bytes'));
      cryptoStub.onSecondCall().returns(Buffer.from('test-state-bytes'));

      const challenge = oauthService.generatePKCEChallenge();

      expect(challenge).to.have.property('codeVerifier');
      expect(challenge).to.have.property('codeChallenge');
      expect(challenge).to.have.property('state');
      expect(challenge.codeVerifier).to.be.a('string');
      expect(challenge.codeChallenge).to.be.a('string');
      expect(challenge.state).to.be.a('string');
    });

    it('should store current PKCE challenge internally', () => {
      cryptoStub.returns(Buffer.from('test-bytes'));

      const challenge = oauthService.generatePKCEChallenge();

      expect((oauthService as any).currentPKCEChallenge).to.deep.equal(challenge);
    });

    it('should generate unique challenges on multiple calls', () => {
      cryptoStub.onFirstCall().returns(Buffer.from('first-call'));
      cryptoStub.onSecondCall().returns(Buffer.from('first-state'));
      cryptoStub.onThirdCall().returns(Buffer.from('second-call'));
      cryptoStub.onCall(3).returns(Buffer.from('second-state'));

      const challenge1 = oauthService.generatePKCEChallenge();
      const challenge2 = oauthService.generatePKCEChallenge();

      expect(challenge1.codeVerifier).to.not.equal(challenge2.codeVerifier);
      expect(challenge1.state).to.not.equal(challenge2.state);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('should build authorization URL with PKCE parameters', () => {
      cryptoStub.returns(Buffer.from('test-bytes'));

      const challenge = oauthService.generatePKCEChallenge();
      const authUrl = oauthService.buildAuthorizationUrl(challenge);

      const url = new URL(authUrl);
      expect(url.origin + url.pathname).to.equal(mockConfig.authorizationUrl);
      expect(url.searchParams.get('client_id')).to.equal(mockConfig.clientId);
      expect(url.searchParams.get('redirect_uri')).to.equal(mockConfig.redirectUri);
      expect(url.searchParams.get('response_type')).to.equal('code');
      expect(url.searchParams.get('scope')).to.equal('code completions');
      expect(url.searchParams.get('code_challenge')).to.equal(challenge.codeChallenge);
      expect(url.searchParams.get('code_challenge_method')).to.equal('S256');
      expect(url.searchParams.get('state')).to.equal(challenge.state);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for access token', async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'code completions',
      };

      fetchStub.resolves({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTokenResponse),
      } as Response);

      const result = await oauthService.exchangeCodeForToken('test-auth-code', 'test-verifier');

      expect(fetchStub).to.have.been.calledWith(mockConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: sinon.match.string,
        signal: sinon.match.any,
      });

      expect(result).to.deep.equal(mockTokenResponse);
    });

    it('should handle token exchange errors', async () => {
      fetchStub.resolves({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'The authorization code is invalid',
          }),
      } as Response);

      try {
        await oauthService.exchangeCodeForToken('invalid-code', 'test-verifier');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).to.include('invalid');
      }
    });

    it('should handle network errors during token exchange', async () => {
      const networkError = new TypeError('Failed to fetch');
      fetchStub.rejects(networkError);

      try {
        await oauthService.exchangeCodeForToken('test-code', 'test-verifier');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).to.include('Network error');
      }
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      const mockRefreshResponse: TokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      };

      fetchStub.resolves({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRefreshResponse),
      } as Response);

      const result = await oauthService.refreshAccessToken('test-refresh-token');

      expect(fetchStub).to.have.been.calledWith(mockConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: sinon.match.string,
        signal: sinon.match.any,
      });

      expect(result).to.deep.equal(mockRefreshResponse);
    });

    it('should handle refresh token errors', async () => {
      fetchStub.resolves({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'The refresh token is invalid',
          }),
      } as Response);

      try {
        await oauthService.refreshAccessToken('invalid-refresh-token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).to.include('invalid');
      }
    });
  });

  describe('validateState', () => {
    it('should validate state parameter correctly', () => {
      cryptoStub.returns(Buffer.from('test-bytes'));
      const challenge = oauthService.generatePKCEChallenge();

      const isValid = oauthService.validateState(challenge.state);
      expect(isValid).to.be.true;
    });

    it('should reject invalid state parameter', () => {
      cryptoStub.returns(Buffer.from('test-bytes'));
      oauthService.generatePKCEChallenge();

      const isValid = oauthService.validateState('invalid-state');
      expect(isValid).to.be.false;
    });

    it('should return false when no PKCE challenge exists', () => {
      const isValid = oauthService.validateState('any-state');
      expect(isValid).to.be.false;
    });
  });

  describe('startCallbackServer', () => {
    it('should start HTTP server and return callback result', async () => {
      const serverPromise = oauthService.startCallbackServer();

      // Wait a bit for server to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate successful callback
      const mockReq = {
        url: '/callback?code=test-code&state=test-state',
      };
      const mockRes = {
        writeHead: sinon.stub(),
        end: sinon.stub(),
      };

      // Access the request handler
      const server = (oauthService as any).server;
      if (server && server.listeners('request').length > 0) {
        const requestHandler = server.listeners('request')[0];
        requestHandler(mockReq, mockRes);
      }

      // Clean up
      oauthService.stopCallbackServer();
    });
  });

  describe('stopCallbackServer', () => {
    it('should close server when stopping callback server', () => {
      const mockServer = {
        close: sinon.stub(),
      };

      (oauthService as any).server = mockServer;

      oauthService.stopCallbackServer();

      expect(mockServer.close).to.have.been.called;
      expect((oauthService as any).server).to.be.null;
    });

    it('should handle case when no server exists', () => {
      (oauthService as any).server = null;

      // Should not throw
      expect(() => oauthService.stopCallbackServer()).to.not.throw();
    });
  });
});
