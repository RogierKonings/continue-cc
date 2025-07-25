import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AuthFlowCoordinator } from '../../../auth/authFlowCoordinator';
import type { AuthenticationService } from '../../../auth/authenticationService';
import { AuthenticationError } from '../../../auth/authenticationError';

// Mock vscode module
jest.mock('vscode');

describe('AuthFlowCoordinator', () => {
  let authFlowCoordinator: AuthFlowCoordinator;
  let mockAuthService: sinon.SinonStubbedInstance<AuthenticationService>;
  let mockContext: vscode.ExtensionContext;
  let windowStub: sinon.SinonStub;
  let progressStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock AuthenticationService
    mockAuthService = {
      authenticate: sinon.stub(),
      getUserInfo: sinon.stub(),
      logout: sinon.stub(),
      refreshToken: sinon.stub(),
      isAuthenticated: sinon.stub(),
    } as any;

    // Mock VSCode context
    mockContext = {} as vscode.ExtensionContext;

    // Mock VSCode window methods
    windowStub = sinon.stub(vscode.window, 'withProgress');
    progressStub = sinon.stub(vscode.window, 'showWarningMessage');

    authFlowCoordinator = new AuthFlowCoordinator(mockAuthService, mockContext);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('startLoginFlow', () => {
    it('should complete OAuth flow successfully', async () => {
      const mockUserInfo = {
        id: 'user123',
        email: 'test@example.com',
        subscription: 'MAX' as const,
      };

      mockAuthService.authenticate.resolves({
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
        userInfo: mockUserInfo,
      });
      mockAuthService.getUserInfo.resolves(mockUserInfo);

      // Mock progress callback
      windowStub.callsFake(async (options, callback) => {
        const mockProgress = {
          report: sinon.stub(),
        };
        const mockToken = {
          onCancellationRequested: sinon.stub(),
        };
        return await callback(mockProgress, mockToken);
      });

      await authFlowCoordinator.startLoginFlow();

      expect(mockAuthService.authenticate.calledOnce).toBe(true);
      expect(mockAuthService.getUserInfo.calledOnce).toBe(true);
    });

    it('should handle authentication cancellation', async () => {
      let cancellationCallback: (() => void) | undefined;

      windowStub.callsFake(async (options, callback) => {
        const mockProgress = {
          report: sinon.stub(),
        };
        const mockToken = {
          onCancellationRequested: (cb: () => void) => {
            cancellationCallback = cb;
          },
        };

        // Simulate cancellation
        setTimeout(() => {
          if (cancellationCallback) {
            cancellationCallback();
          }
        }, 0);

        return await callback(mockProgress, mockToken);
      });

      try {
        await authFlowCoordinator.startLoginFlow();
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toContain('cancelled by user');
      }
    });

    it('should handle authentication failure', async () => {
      const authError = new AuthenticationError('Invalid credentials');
      mockAuthService.authenticate.rejects(authError);

      windowStub.callsFake(async (options, callback) => {
        const mockProgress = {
          report: sinon.stub(),
        };
        const mockToken = {
          onCancellationRequested: sinon.stub(),
        };
        return await callback(mockProgress, mockToken);
      });

      // Mock error handling method
      const handleErrorStub = sinon.stub(authFlowCoordinator as any, 'handleAuthenticationError');

      await authFlowCoordinator.startLoginFlow();

      expect(handleErrorStub.calledWith(authError)).toBe(true);
    });

    it('should show progress updates during flow', async () => {
      const mockUserInfo = {
        id: 'user123',
        email: 'test@example.com',
        subscription: 'MAX' as const,
      };

      mockAuthService.authenticate.resolves({
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
        userInfo: mockUserInfo,
      });
      mockAuthService.getUserInfo.resolves(mockUserInfo);

      let progressReports: any[] = [];

      windowStub.callsFake(async (options, callback) => {
        const mockProgress = {
          report: (report: any) => progressReports.push(report),
        };
        const mockToken = {
          onCancellationRequested: sinon.stub(),
        };
        return await callback(mockProgress, mockToken);
      });

      await authFlowCoordinator.startLoginFlow();

      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports[0].message).toContain('Initializing');
      expect(progressReports.some((r) => r.message?.includes('Opening authentication'))).toBe(true);
      expect(progressReports.some((r) => r.message?.includes('Verifying credentials'))).toBe(true);
      expect(progressReports.some((r) => r.message?.includes('successful'))).toBe(true);
    });
  });

  describe('startLogoutFlow', () => {
    it('should handle logout confirmation', async () => {
      progressStub.resolves('Sign Out');
      mockAuthService.logout.resolves();

      await authFlowCoordinator.startLogoutFlow();

      expect(progressStub.called).toBe(true);
      const callArgs = progressStub.getCall(0).args;
      expect(callArgs[0]).toBe('Are you sure you want to sign out of Claude Code?');
      expect(callArgs[1]).toBe('Sign Out');
      expect(callArgs[2]).toBe('Cancel');
      expect(mockAuthService.logout.calledOnce).toBe(true);
    });

    it('should handle logout cancellation', async () => {
      progressStub.resolves('Cancel');

      await authFlowCoordinator.startLogoutFlow();

      expect(mockAuthService.logout.called).toBe(false);
    });

    it('should handle logout when user closes dialog', async () => {
      progressStub.resolves(undefined);

      await authFlowCoordinator.startLogoutFlow();

      expect(mockAuthService.logout.called).toBe(false);
    });

    it('should handle logout errors', async () => {
      progressStub.resolves('Sign Out');
      const logoutError = new Error('Logout failed');
      mockAuthService.logout.rejects(logoutError);

      const handleErrorStub = sinon.stub(authFlowCoordinator as any, 'handleAuthenticationError');

      await authFlowCoordinator.startLogoutFlow();

      expect(handleErrorStub.calledWith(logoutError)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should show error message for authentication errors', () => {
      const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
      const error = new AuthenticationError('Test error');

      (authFlowCoordinator as any).handleAuthenticationError(error);

      expect(showErrorStub.called).toBe(true);
      const callArgs = showErrorStub.getCall(0).args;
      expect(callArgs[0]).toMatch(/authentication.*failed/i);
    });

    it('should show generic error message for unknown errors', () => {
      const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Unknown error');

      (authFlowCoordinator as any).handleAuthenticationError(error);

      expect(showErrorStub.called).toBe(true);
    });
  });

  describe('Success messaging', () => {
    it('should show success message with user info', async () => {
      const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
      const mockUserInfo = {
        id: 'user123',
        email: 'test@example.com',
        subscription: 'MAX' as const,
      };

      await (authFlowCoordinator as any).showSuccessMessage(mockUserInfo);

      expect(showInfoStub.called).toBe(true);
      const callArgs = showInfoStub.getCall(0).args;
      expect(callArgs[0]).toMatch(/successfully authenticated/i);
    });
  });
});
