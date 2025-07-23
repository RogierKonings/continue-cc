import * as vscode from 'vscode';
import { AuthFlowCoordinator } from './auth/authFlowCoordinator';
import { ClaudeAuthService } from './auth/claudeAuthService';
import { AuthStatusBar } from './views/authStatusBar';
import { CompletionProviderRegistry } from './autocomplete/completionProviderRegistry';

let authService: ClaudeAuthService;
let authFlowCoordinator: AuthFlowCoordinator;
let authStatusBar: AuthStatusBar;
let completionRegistry: CompletionProviderRegistry;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Claude Code Continue extension is now active!');

  // Initialize authentication services
  authService = new ClaudeAuthService(context);
  authFlowCoordinator = new AuthFlowCoordinator(authService, context);
  authStatusBar = new AuthStatusBar(authService, context);

  // Initialize autocomplete services
  completionRegistry = new CompletionProviderRegistry();
  completionRegistry.register(context);

  // Register partial accept command for inline completions
  const partialAcceptCommand = vscode.commands.registerCommand(
    'continue-cc.acceptPartialCompletion',
    () => {
      return vscode.commands.executeCommand('editor.action.inlineSuggest.acceptNextWord');
    }
  );

  // Register tracking commands for completions
  const trackCompletionCommand = vscode.commands.registerCommand(
    'continue-cc.trackCompletion',
    (text: string) => {
      console.log('Completion accepted:', text);
    }
  );

  const trackInlineCompletionCommand = vscode.commands.registerCommand(
    'continue-cc.trackInlineCompletion',
    (text: string) => {
      console.log('Inline completion accepted:', text);
    }
  );

  // Register sign in command
  const signInCommand = vscode.commands.registerCommand('claude-code-continue.signIn', async () => {
    await authFlowCoordinator.startLoginFlow();
    await authStatusBar.updateStatus();
  });

  // Register sign out command
  const signOutCommand = vscode.commands.registerCommand(
    'claude-code-continue.signOut',
    async () => {
      await authFlowCoordinator.startLogoutFlow();
      await authStatusBar.updateStatus();
    }
  );

  // Register auth menu command
  const authMenuCommand = vscode.commands.registerCommand(
    'claude-code-continue.showAuthMenu',
    async () => {
      const isAuthenticated = await authService.isAuthenticated();

      if (isAuthenticated) {
        const userInfo = await authService.getUserInfo();
        const displayName = userInfo.email || userInfo.username || 'User';

        const selection = await vscode.window.showQuickPick(
          [
            `$(account) Signed in as ${displayName}`,
            '$(sync) Refresh Session',
            '$(sign-out) Sign Out',
            '$(info) View Session Details',
          ],
          {
            placeHolder: 'Claude Code Authentication',
          }
        );

        if (selection?.includes('Sign Out')) {
          await authFlowCoordinator.startLogoutFlow();
          await authStatusBar.updateStatus();
        } else if (selection?.includes('Refresh Session')) {
          const result = await authService.refreshToken();
          if (result) {
            vscode.window.showInformationMessage('Session refreshed successfully');
          } else {
            vscode.window.showWarningMessage('Could not refresh session. Please sign in again.');
          }
          await authStatusBar.updateStatus();
        } else if (selection?.includes('View Session Details')) {
          const tokenExpiry = context.globalState.get<string>('claude-code.tokenExpiry');
          const expiryDate = tokenExpiry ? new Date(tokenExpiry) : null;
          const message = expiryDate
            ? `Session expires: ${expiryDate.toLocaleString()}`
            : 'Session information unavailable';
          vscode.window.showInformationMessage(message);
        }
      } else {
        await authFlowCoordinator.startLoginFlow();
        await authStatusBar.updateStatus();
      }
    }
  );

  // Register URI handler for OAuth callbacks
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      if (uri.path === '/auth-callback') {
        // The auth flow coordinator will handle this through its own URI handler
        console.log('Received auth callback', uri.toString());
      }
    },
  });

  // Add sign in button to welcome views
  vscode.window.registerTreeDataProvider('claude-code-continue.welcome', {
    getTreeItem: (element: vscode.TreeItem) => element,
    getChildren: async () => {
      const isAuthenticated = await authService.isAuthenticated();
      if (!isAuthenticated) {
        const signInItem = new vscode.TreeItem('Sign In to Claude Code');
        signInItem.command = {
          command: 'claude-code-continue.signIn',
          title: 'Sign In',
        };
        signInItem.iconPath = new vscode.ThemeIcon('sign-in');
        return [signInItem];
      }
      return [];
    },
  });

  context.subscriptions.push(
    signInCommand,
    signOutCommand,
    authMenuCommand,
    uriHandler,
    authStatusBar,
    partialAcceptCommand,
    trackCompletionCommand,
    trackInlineCompletionCommand
  );
}

export function deactivate(): void {
  console.log('Claude Code Continue extension is now deactivated');

  // Clean up autocomplete resources
  if (completionRegistry) {
    completionRegistry.dispose();
  }
}
