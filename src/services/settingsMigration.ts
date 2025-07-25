import * as vscode from 'vscode';

interface SettingsMigration {
  version: string;
  migrate: (context: vscode.ExtensionContext) => Promise<void>;
}

export class SettingsMigrationService {
  private static readonly SETTINGS_VERSION_KEY = 'continue-cc.settingsVersion';

  private migrations: SettingsMigration[] = [
    {
      version: '0.0.1',
      migrate: async (context) => {
        // Initial version - no migration needed
      },
    },
    {
      version: '0.1.0',
      migrate: async (context) => {
        // Example migration: rename old settings
        const config = vscode.workspace.getConfiguration();

        // Migrate old autocomplete.enableCaching to performance.enableCaching
        const oldCachingSetting = config.inspect('continue-cc.autocomplete.enableCaching');
        if (oldCachingSetting?.globalValue !== undefined) {
          await config.update(
            'continue-cc.performance.enableCaching',
            oldCachingSetting.globalValue,
            vscode.ConfigurationTarget.Global
          );
          await config.update(
            'continue-cc.autocomplete.enableCaching',
            undefined,
            vscode.ConfigurationTarget.Global
          );
        }

        // Migrate old autocomplete.cacheTTL to performance.cacheTTL
        const oldCacheTTL = config.inspect('continue-cc.autocomplete.cacheTTL');
        if (oldCacheTTL?.globalValue !== undefined) {
          await config.update(
            'continue-cc.performance.cacheTTL',
            oldCacheTTL.globalValue,
            vscode.ConfigurationTarget.Global
          );
          await config.update(
            'continue-cc.autocomplete.cacheTTL',
            undefined,
            vscode.ConfigurationTarget.Global
          );
        }
      },
    },
  ];

  constructor(private context: vscode.ExtensionContext) {}

  public async runMigrations(): Promise<void> {
    const currentVersion = this.context.extension.packageJSON.version;
    const lastMigratedVersion = this.context.globalState.get<string>(
      SettingsMigrationService.SETTINGS_VERSION_KEY,
      '0.0.0'
    );

    // Find migrations that need to be run
    const migrationsToRun = this.migrations.filter((migration) => {
      return (
        this.compareVersions(migration.version, lastMigratedVersion) > 0 &&
        this.compareVersions(migration.version, currentVersion) <= 0
      );
    });

    if (migrationsToRun.length === 0) {
      return;
    }

    // Show migration notification
    const migrationMessage = vscode.window.setStatusBarMessage(
      'Claude Code: Migrating settings...',
      2000
    );

    try {
      // Run migrations in order
      for (const migration of migrationsToRun) {
        console.log(`Running settings migration for version ${migration.version}`);
        await migration.migrate(this.context);
      }

      // Update the last migrated version
      await this.context.globalState.update(
        SettingsMigrationService.SETTINGS_VERSION_KEY,
        currentVersion
      );

      vscode.window.showInformationMessage('Claude Code settings have been migrated successfully.');
    } catch (error) {
      console.error('Settings migration failed:', error);
      vscode.window.showErrorMessage(`Failed to migrate Claude Code settings: ${error}`);
    }
  }

  public async validateSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('continue-cc');
    const validationErrors: string[] = [];

    // Validate numeric ranges
    const completionDelay = config.get<number>('autocomplete.completionDelay');
    if (completionDelay !== undefined && (completionDelay < 0 || completionDelay > 1000)) {
      validationErrors.push('Completion delay must be between 0 and 1000ms');
      await config.update('autocomplete.completionDelay', 150, vscode.ConfigurationTarget.Global);
    }

    const minChars = config.get<number>('autocomplete.minimumCharacters');
    if (minChars !== undefined && (minChars < 1 || minChars > 10)) {
      validationErrors.push('Minimum characters must be between 1 and 10');
      await config.update('autocomplete.minimumCharacters', 2, vscode.ConfigurationTarget.Global);
    }

    const contextWindow = config.get<number>('advanced.contextWindow');
    if (contextWindow !== undefined && (contextWindow < 1000 || contextWindow > 8000)) {
      validationErrors.push('Context window must be between 1000 and 8000 tokens');
      await config.update('advanced.contextWindow', 4000, vscode.ConfigurationTarget.Global);
    }

    const temperature = config.get<number>('advanced.temperature');
    if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
      validationErrors.push('Temperature must be between 0 and 1');
      await config.update('advanced.temperature', 0.2, vscode.ConfigurationTarget.Global);
    }

    // Validate array settings
    const ignoredPatterns = config.get<string[]>('advanced.ignoredFilePatterns');
    if (ignoredPatterns && !Array.isArray(ignoredPatterns)) {
      validationErrors.push('Ignored file patterns must be an array');
      await config.update(
        'advanced.ignoredFilePatterns',
        ['**/node_modules/**', '**/dist/**', '**/build/**'],
        vscode.ConfigurationTarget.Global
      );
    }

    // Show validation errors if any
    if (validationErrors.length > 0) {
      vscode.window.showWarningMessage(
        'Some Claude Code settings were invalid and have been reset:\n' +
          validationErrors.join('\n')
      );
    }
  }

  public async exportSettings(): Promise<any> {
    const config = vscode.workspace.getConfiguration('continue-cc');
    const allSettings: any = {};

    // Get all configuration properties
    const properties = [
      'enable',
      'autocomplete.enabled',
      'autocomplete.automaticTrigger',
      'autocomplete.completionDelay',
      'autocomplete.minimumCharacters',
      'autocomplete.maxCompletions',
      'autocomplete.disableInComments',
      'autocomplete.disableInStrings',
      'autocomplete.enableInlineCompletions',
      'languages.javascript',
      'languages.typescript',
      'languages.python',
      'performance.enableCaching',
      'performance.cacheTTL',
      'performance.maxConcurrentRequests',
      'advanced.contextWindow',
      'advanced.temperature',
      'advanced.completionTriggerPatterns',
      'advanced.ignoredFilePatterns',
      'advanced.apiEndpoint',
      'telemetry.enabled',
      'telemetry.shareCodeContext',
      'privacy.maskSensitiveData',
      'experimental.enableBetaFeatures',
      'experimental.enableSemanticCompletion',
      'experimental.enableMultiFileContext',
    ];

    for (const prop of properties) {
      const value = config.get(prop);
      if (value !== undefined) {
        this.setNestedProperty(allSettings, prop, value);
      }
    }

    return {
      version: this.context.extension.packageJSON.version,
      timestamp: new Date().toISOString(),
      settings: allSettings,
    };
  }

  public async importSettings(settingsData: any): Promise<void> {
    if (!settingsData.version || !settingsData.settings) {
      throw new Error('Invalid settings file format');
    }

    const config = vscode.workspace.getConfiguration('continue-cc');

    // Import all settings
    await this.importNestedSettings(config, settingsData.settings, '');

    // Run validations
    await this.validateSettings();
  }

  private async importNestedSettings(
    config: vscode.WorkspaceConfiguration,
    settings: any,
    prefix: string
  ): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recurse for nested objects
        await this.importNestedSettings(config, value, fullKey);
      } else {
        // Set the value
        await config.update(fullKey, value, vscode.ConfigurationTarget.Global);
      }
    }
  }

  private setNestedProperty(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }
}
