import * as vscode from 'vscode';
import { AuthFlowCoordinator } from './auth/authFlowCoordinator';
import { ClaudeAuthService } from './auth/claudeAuthService';
import { AuthStatusBar } from './views/authStatusBar';
import { CompletionProviderRegistry } from './autocomplete/completionProviderRegistry';
import { CompletionCommands } from './commands/completionCommands';
import { SettingsCommands } from './commands/settingsCommands';
import { GeneralCommands } from './commands/generalCommands';
import { registerQuickActions } from './providers/quickActionsProvider';
import { SettingsMigrationService } from './services/settingsMigration';
import { StatusBarService } from './services/statusBarService';
import { LoadingIndicatorService } from './services/loadingIndicatorService';
import { NotificationService } from './services/notificationService';

let authService: ClaudeAuthService;
let authFlowCoordinator: AuthFlowCoordinator;
let authStatusBar: AuthStatusBar;
let statusBarService: StatusBarService;
let loadingIndicatorService: LoadingIndicatorService;
let notificationService: NotificationService;
let completionRegistry: CompletionProviderRegistry;
let completionCommands: CompletionCommands;
let settingsCommands: SettingsCommands;
let generalCommands: GeneralCommands;

// Export services for use in other modules
export function getNotificationService(): NotificationService {
  return notificationService;
}

export function getStatusBarService(): StatusBarService {
  return statusBarService;
}

export function getLoadingIndicatorService(): LoadingIndicatorService {
  return loadingIndicatorService;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Claude Code Continue extension is now active!');

  // Run settings migration first
  const migrationService = new SettingsMigrationService(context);
  await migrationService.runMigrations();
  await migrationService.validateSettings();

  // Initialize authentication services
  authService = new ClaudeAuthService(context);
  authFlowCoordinator = new AuthFlowCoordinator(authService, context);
  authStatusBar = new AuthStatusBar(authService, context);

  // Initialize enhanced status bar service
  statusBarService = new StatusBarService(authService, context);

  // Initialize loading indicator service
  loadingIndicatorService = new LoadingIndicatorService(context, statusBarService);

  // Initialize notification service
  notificationService = new NotificationService(context);

  // Initialize autocomplete services
  completionRegistry = new CompletionProviderRegistry();
  completionRegistry.register(context);

  // Initialize command handlers
  completionCommands = new CompletionCommands(context, completionRegistry);
  settingsCommands = new SettingsCommands(context);
  generalCommands = new GeneralCommands(context);

  // Register quick actions and code action providers
  registerQuickActions(context);

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

  // Register completion mode switching command
  const switchCompletionModeCommand = vscode.commands.registerCommand(
    'continue-cc.switchCompletionMode',
    async () => {
      const provider = completionRegistry.getProvider();
      if (provider && 'getModeManager' in provider) {
        const modeManager = (provider as any).getModeManager();
        await modeManager.showModeQuickPick();
      }
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
    trackInlineCompletionCommand,
    switchCompletionModeCommand
  );
}

export function deactivate(): void {
  console.log('Claude Code Continue extension is now deactivated');

  // Clean up autocomplete resources
  if (completionRegistry) {
    completionRegistry.dispose();
  }

  // Clean up command resources
  if (generalCommands) {
    generalCommands.dispose();
  }

  // Clean up services
  if (statusBarService) {
    statusBarService.dispose();
  }

  if (loadingIndicatorService) {
    loadingIndicatorService.dispose();
  }
}
