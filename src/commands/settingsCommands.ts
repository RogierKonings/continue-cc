import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsWebviewProvider } from '../webviews/settingsWebviewProvider';

export class SettingsCommands {
  private settingsWebviewProvider: SettingsWebviewProvider;

  constructor(private context: vscode.ExtensionContext) {
    this.settingsWebviewProvider = new SettingsWebviewProvider(context.extensionUri, context);
    this.registerCommands();
  }

  private registerCommands(): void {
    // Open Settings
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.openSettings', () => {
        // Open custom settings UI instead of VS Code settings
        this.settingsWebviewProvider.showSettingsPanel();
      })
    );

    // Reset Keybindings
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.resetKeybindings', async () => {
        const answer = await vscode.window.showWarningMessage(
          'Are you sure you want to reset all Claude Code keybindings to default?',
          'Yes',
          'No'
        );

        if (answer === 'Yes') {
          // Reset keybindings by removing user customizations
          const config = vscode.workspace.getConfiguration();
          const keybindings = config.inspect('keyboard.keybindings');

          if (keybindings?.globalValue) {
            const userKeybindings = keybindings.globalValue as any[];
            const filteredKeybindings = userKeybindings.filter(
              (kb) => !kb.command?.startsWith('continue-cc.')
            );

            await config.update(
              'keyboard.keybindings',
              filteredKeybindings,
              vscode.ConfigurationTarget.Global
            );
          }

          vscode.window.showInformationMessage('Keybindings reset to default');
        }
      })
    );

    // Export Settings
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.exportSettings', async () => {
        const config = vscode.workspace.getConfiguration('continue-cc');
        const settings = {
          autocomplete: config.get('autocomplete'),
          keybindings: await this.getUserKeybindings(),
          version: this.context.extension.packageJSON.version,
        };

        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file('claude-code-settings.json'),
          filters: {
            'JSON files': ['json'],
          },
        });

        if (uri) {
          try {
            await vscode.workspace.fs.writeFile(
              uri,
              Buffer.from(JSON.stringify(settings, null, 2))
            );
            vscode.window.showInformationMessage('Settings exported successfully');
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to export settings: ${error}`);
          }
        }
      })
    );

    // Import Settings
    this.context.subscriptions.push(
      vscode.commands.registerCommand('continue-cc.importSettings', async () => {
        const uri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'JSON files': ['json'],
          },
        });

        if (uri && uri[0]) {
          try {
            const content = await vscode.workspace.fs.readFile(uri[0]);
            const settings = JSON.parse(content.toString());

            // Validate settings structure
            if (!settings.version || !settings.autocomplete) {
              throw new Error('Invalid settings file format');
            }

            // Apply autocomplete settings
            const config = vscode.workspace.getConfiguration('continue-cc');
            await config.update(
              'autocomplete',
              settings.autocomplete,
              vscode.ConfigurationTarget.Global
            );

            // Apply keybindings if present
            if (settings.keybindings) {
              await this.applyUserKeybindings(settings.keybindings);
            }

            vscode.window.showInformationMessage('Settings imported successfully');
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to import settings: ${error}`);
          }
        }
      })
    );
  }

  private async getUserKeybindings(): Promise<any[]> {
    const config = vscode.workspace.getConfiguration();
    const keybindings = config.inspect('keyboard.keybindings');

    if (keybindings?.globalValue) {
      const userKeybindings = keybindings.globalValue as any[];
      return userKeybindings.filter((kb) => kb.command?.startsWith('continue-cc.'));
    }

    return [];
  }

  private async applyUserKeybindings(keybindings: any[]): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const currentKeybindings = config.inspect('keyboard.keybindings');
    let userKeybindings = (currentKeybindings?.globalValue as any[]) || [];

    // Remove existing Claude Code keybindings
    userKeybindings = userKeybindings.filter((kb) => !kb.command?.startsWith('continue-cc.'));

    // Add imported keybindings
    userKeybindings.push(...keybindings);

    await config.update('keyboard.keybindings', userKeybindings, vscode.ConfigurationTarget.Global);
  }
}
