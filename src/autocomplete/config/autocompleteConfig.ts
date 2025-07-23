import * as vscode from 'vscode';

export interface AutocompleteConfig {
  enabled: boolean;
  automaticTrigger: boolean;
  minimumCharacters: number;
  completionDelay: number;
  disableInComments: boolean;
  disableInStrings: boolean;
  maxCompletions: number;
  enableInlineCompletions: boolean;
  enableCaching: boolean;
  cacheTTL: number;
  triggerCharacters: string[];
}

export class AutocompleteConfigManager {
  private static readonly CONFIG_SECTION = 'continue-cc.autocomplete';

  static getConfig(): AutocompleteConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

    return {
      enabled: config.get<boolean>('enabled', true),
      automaticTrigger: config.get<boolean>('automaticTrigger', true),
      minimumCharacters: config.get<number>('minimumCharacters', 2),
      completionDelay: config.get<number>('completionDelay', 200),
      disableInComments: config.get<boolean>('disableInComments', false),
      disableInStrings: config.get<boolean>('disableInStrings', false),
      maxCompletions: config.get<number>('maxCompletions', 20),
      enableInlineCompletions: config.get<boolean>('enableInlineCompletions', true),
      enableCaching: config.get<boolean>('enableCaching', true),
      cacheTTL: config.get<number>('cacheTTL', 300000), // 5 minutes
      triggerCharacters: config.get<string[]>('triggerCharacters', ['.', ' ']),
    };
  }

  static onConfigChange(callback: (config: AutocompleteConfig) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.CONFIG_SECTION)) {
        callback(this.getConfig());
      }
    });
  }

  static async updateConfig(key: keyof AutocompleteConfig, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
