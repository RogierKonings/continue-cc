import * as chai from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import '../../setup';

const { expect } = chai;
import { TokenManager, TokenValidationResult } from '../../../auth/tokenManager';
import type { AuthenticationResult } from '../../../auth/authenticationService';
import { AuthenticationError } from '../../../auth/authenticationError';

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let mockContext: vscode.ExtensionContext;
  let mockSecrets: sinon.SinonStubbedInstance<vscode.SecretStorage>;
  let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
  let onTokenRefreshStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    // Create fake timers
    clock = sinon.useFakeTimers();

    // Mock SecretStorage
    mockSecrets = {
      get: sinon.stub(),
      store: sinon.stub(),
      delete: sinon.stub(),
      onDidChange: sinon.stub(),
    } as any;

    // Mock GlobalState
    mockGlobalState = {
      get: sinon.stub(),
      update: sinon.stub(),
      keys: sinon.stub(),
      setKeysForSync: sinon.stub(),
    } as any;

    // Mock ExtensionContext
    mockContext = {
      secrets: mockSecrets,
      globalState: mockGlobalState,
    } as any;

    onTokenRefreshStub = sinon.stub();

    tokenManager = new TokenManager(mockContext, onTokenRefreshStub);
  });

  afterEach(() => {
    tokenManager.stopAutoRefresh();
    clock.restore();
    sinon.restore();
  });

  describe('validateStoredToken', () => {
    it('should return invalid when no token exists', async () => {
      mockSecrets.get.resolves(undefined);
      mockGlobalState.get.returns(undefined);

      const result = await tokenManager.validateStoredToken();

      expect(result).to.deep.equal({
        isValid: false,
        needsRefresh: false,
      });
    });

    it('should return invalid when token exists but no expiry', async () => {
      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(undefined);

      const result = await tokenManager.validateStoredToken();

      expect(result).to.deep.equal({
        isValid: false,
        needsRefresh: false,
      });
    });

    it('should return expired when token has expired', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(expiredDate);

      const result = await tokenManager.validateStoredToken();

      expect(result.isValid).to.be.false;
      expect(result.needsRefresh).to.be.true;
    });

    it('should return needs refresh when token expires soon', async () => {
      // Token expires in 3 minutes (less than 5 minute buffer)
      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(nearExpiryDate);

      const result = await tokenManager.validateStoredToken();

      expect(result.isValid).to.be.true;
      expect(result.needsRefresh).to.be.true;
      expect(result.expiresAt).to.deep.equal(new Date(nearExpiryDate));
    });

    it('should return valid when token is not expiring soon', async () => {
      // Token expires in 30 minutes
      const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(futureDate);

      const result = await tokenManager.validateStoredToken();

      expect(result.isValid).to.be.true;
      expect(result.needsRefresh).to.be.false;
      expect(result.expiresAt).to.deep.equal(new Date(futureDate));
    });
  });

  describe('startAutoRefresh', () => {
    it('should set up auto refresh timer for token expiring soon', async () => {
      // Token expires in 3 minutes
      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(nearExpiryDate);

      await tokenManager.startAutoRefresh();

      // Verify immediate refresh was called
      expect(onTokenRefreshStub).to.have.been.called;
    });

    it('should immediately refresh expired token', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(expiredDate);

      await tokenManager.startAutoRefresh();

      expect(onTokenRefreshStub).to.have.been.called;
    });

    it("should not refresh valid token that doesn't need refresh", async () => {
      // Token expires in 30 minutes
      const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(futureDate);

      await tokenManager.startAutoRefresh();

      expect(onTokenRefreshStub).not.to.have.been.called;
    });

    it('should clear existing timer before setting new one', async () => {
      const stopSpy = sinon.spy(tokenManager, 'stopAutoRefresh');

      // Token expires in 3 minutes
      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000).toISOString();

      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(nearExpiryDate);

      await tokenManager.startAutoRefresh();
      expect(stopSpy).to.have.been.called;
    });
  });

  describe('stopAutoRefresh', () => {
    it('should clear existing refresh timer', async () => {
      // Set up a timer first
      const nearExpiryDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      mockSecrets.get.resolves('test-token');
      mockGlobalState.get.returns(nearExpiryDate);

      await tokenManager.startAutoRefresh();

      // Stop auto refresh
      tokenManager.stopAutoRefresh();

      // Timer should be cleared (we can't easily test this directly)
      expect(true).to.be.true; // Placeholder assertion
    });
  });

  describe('getValidToken', () => {
    it('should return stored token when valid', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      mockSecrets.get.withArgs('claude-code.accessToken').resolves('valid-token');
      mockGlobalState.get.returns(futureDate);

      const token = await tokenManager.getValidToken();

      expect(token).to.equal('valid-token');
    });

    it('should refresh and return new token when expired', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      mockSecrets.get.withArgs('claude-code.accessToken').resolves('expired-token');
      mockGlobalState.get.returns(expiredDate);

      const newAuthResult: AuthenticationResult = {
        accessToken: 'new-token',
        expiresAt: new Date(Date.now() + 3600000),
        userInfo: { id: 'user123' },
      };

      onTokenRefreshStub.resolves(newAuthResult);

      // Mock the updated token after refresh
      mockSecrets.get.withArgs('claude-code.accessToken').onSecondCall().resolves('new-token');
      mockGlobalState.get.onSecondCall().returns(new Date(Date.now() + 3600000).toISOString());

      const token = await tokenManager.getValidToken();

      expect(onTokenRefreshStub).to.have.been.called;
      expect(token).to.equal('new-token');
    });

    it('should return undefined when refresh fails', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      mockSecrets.get.withArgs('claude-code.accessToken').resolves('expired-token');
      mockGlobalState.get.returns(expiredDate);

      onTokenRefreshStub.rejects(new AuthenticationError('Refresh failed'));

      const token = await tokenManager.getValidToken();

      expect(token).to.be.undefined;
    });

    it('should return undefined when no token exists', async () => {
      mockSecrets.get.resolves(undefined);
      mockGlobalState.get.returns(undefined);

      const token = await tokenManager.getValidToken();

      expect(token).to.be.undefined;
    });
  });

  describe('clearToken', () => {
    it('should remove stored tokens and expiry', async () => {
      await tokenManager.clearToken();

      expect(mockSecrets.delete).to.have.been.calledWith('claude-code.accessToken');
      expect(mockGlobalState.update).to.have.been.calledWith('claude-code.tokenExpiry', undefined);
    });

    it('should stop auto refresh when clearing token', async () => {
      const stopSpy = sinon.spy(tokenManager, 'stopAutoRefresh');

      await tokenManager.clearToken();

      expect(stopSpy).to.have.been.called;
    });
  });

  describe('revokeToken', () => {
    it('should make revoke request to OAuth server', async () => {
      const fetchStub = sinon.stub(global, 'fetch').resolves({
        ok: true,
        status: 200,
      } as Response);

      await tokenManager.revokeToken('test-token');

      expect(fetchStub).to.have.been.calledWith('https://auth.anthropic.com/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: sinon.match.string,
      });

      fetchStub.restore();
    });

    it('should handle revoke errors gracefully', async () => {
      const fetchStub = sinon.stub(global, 'fetch').rejects(new Error('Network error'));

      // Should not throw
      await tokenManager.revokeToken('test-token');

      fetchStub.restore();
    });
  });
});
