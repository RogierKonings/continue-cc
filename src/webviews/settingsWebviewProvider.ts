import * as vscode from 'vscode';

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claude-code-continue.settingsView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private context: vscode.ExtensionContext
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'updateSetting':
            this.updateSetting(message.setting, message.value);
            break;
          case 'resetDefaults':
            this.resetDefaults();
            break;
          case 'search':
            this.searchSettings(message.query);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Update webview when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('continue-cc')) {
        this.updateWebview();
      }
    });
  }

  public showSettingsPanel() {
    const panel = vscode.window.createWebviewPanel(
      'claudeCodeSettings',
      'Claude Code Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri],
      }
    );

    panel.webview.html = this._getHtmlForWebview(panel.webview);

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'updateSetting':
            this.updateSetting(message.setting, message.value);
            break;
          case 'resetDefaults':
            this.resetDefaults();
            break;
          case 'search':
            this.searchSettings(message.query);
            break;
          case 'openInSettings':
            vscode.commands.executeCommand('workbench.action.openSettings', message.setting);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    return panel;
  }

  private updateSetting(setting: string, value: any) {
    const config = vscode.workspace.getConfiguration();
    config.update(setting, value, vscode.ConfigurationTarget.Global);
  }

  private resetDefaults() {
    vscode.window
      .showWarningMessage(
        'Are you sure you want to reset all Claude Code settings to defaults?',
        'Yes',
        'No'
      )
      .then((answer) => {
        if (answer === 'Yes') {
          const config = vscode.workspace.getConfiguration('continue-cc');
          const inspection = config.inspect('');

          // Reset all settings under continue-cc
          const settings = [
            'enable',
            'autocomplete.enabled',
            'autocomplete.automaticTrigger',
            'autocomplete.completionDelay',
            'autocomplete.minimumCharacters',
            'autocomplete.maxCompletions',
            'autocomplete.disableInComments',
            'autocomplete.disableInStrings',
            'autocomplete.enableInlineCompletions',
            'performance.enableCaching',
            'performance.cacheTTL',
            'performance.maxConcurrentRequests',
            'advanced.contextWindow',
            'advanced.temperature',
            'telemetry.enabled',
            'telemetry.shareCodeContext',
            'privacy.maskSensitiveData',
            'experimental.enableBetaFeatures',
          ];

          settings.forEach((setting) => {
            config.update(setting, undefined, vscode.ConfigurationTarget.Global);
          });

          vscode.window.showInformationMessage('Settings reset to defaults');
          this.updateWebview();
        }
      });
  }

  private searchSettings(query: string) {
    // This would filter the settings based on the search query
    // For now, we'll just update the webview
    if (this._view) {
      this._view.webview.postMessage({
        command: 'searchResults',
        query: query,
      });
    }
  }

  private updateWebview() {
    if (this._view) {
      const config = vscode.workspace.getConfiguration('continue-cc');
      this._view.webview.postMessage({
        command: 'updateSettings',
        settings: this.getAllSettings(),
      });
    }
  }

  private getAllSettings() {
    const config = vscode.workspace.getConfiguration('continue-cc');
    return {
      general: {
        enable: config.get('enable'),
        clientId: vscode.workspace.getConfiguration('claude-code').get('clientId'),
      },
      autocomplete: {
        enabled: config.get('autocomplete.enabled'),
        automaticTrigger: config.get('autocomplete.automaticTrigger'),
        completionDelay: config.get('autocomplete.completionDelay'),
        minimumCharacters: config.get('autocomplete.minimumCharacters'),
        maxCompletions: config.get('autocomplete.maxCompletions'),
        disableInComments: config.get('autocomplete.disableInComments'),
        disableInStrings: config.get('autocomplete.disableInStrings'),
        enableInlineCompletions: config.get('autocomplete.enableInlineCompletions'),
      },
      languages: {
        javascript: config.get('languages.javascript'),
        typescript: config.get('languages.typescript'),
        python: config.get('languages.python'),
      },
      performance: {
        enableCaching: config.get('performance.enableCaching'),
        cacheTTL: config.get('performance.cacheTTL'),
        maxConcurrentRequests: config.get('performance.maxConcurrentRequests'),
      },
      advanced: {
        contextWindow: config.get('advanced.contextWindow'),
        temperature: config.get('advanced.temperature'),
        completionTriggerPatterns: config.get('advanced.completionTriggerPatterns'),
        ignoredFilePatterns: config.get('advanced.ignoredFilePatterns'),
        apiEndpoint: config.get('advanced.apiEndpoint'),
      },
      telemetry: {
        enabled: config.get('telemetry.enabled'),
        shareCodeContext: config.get('telemetry.shareCodeContext'),
      },
      privacy: {
        maskSensitiveData: config.get('privacy.maskSensitiveData'),
      },
      experimental: {
        enableBetaFeatures: config.get('experimental.enableBetaFeatures'),
        enableSemanticCompletion: config.get('experimental.enableSemanticCompletion'),
        enableMultiFileContext: config.get('experimental.enableMultiFileContext'),
      },
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const settings = this.getAllSettings();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Claude Code Settings</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
          padding: 20px;
          margin: 0;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        h1 {
          margin: 0;
          font-size: 24px;
          color: var(--vscode-foreground);
        }
        
        .search-container {
          position: relative;
          margin-bottom: 20px;
        }
        
        .search-input {
          width: 100%;
          padding: 8px 12px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-size: 14px;
        }
        
        .search-input:focus {
          outline: 1px solid var(--vscode-focusBorder);
          border-color: var(--vscode-focusBorder);
        }
        
        .settings-category {
          margin-bottom: 30px;
          background-color: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          padding: 20px;
        }
        
        .category-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          cursor: pointer;
        }
        
        .category-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--vscode-foreground);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .chevron {
          transition: transform 0.2s;
        }
        
        .chevron.collapsed {
          transform: rotate(-90deg);
        }
        
        .category-content {
          display: block;
        }
        
        .category-content.collapsed {
          display: none;
        }
        
        .setting-item {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .setting-item:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
        
        .setting-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        
        .setting-label {
          font-weight: 500;
          color: var(--vscode-foreground);
          margin-bottom: 4px;
        }
        
        .setting-description {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin-bottom: 8px;
        }
        
        .setting-control {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        
        input[type="number"],
        input[type="text"],
        select {
          padding: 6px 10px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-size: 13px;
        }
        
        input[type="range"] {
          width: 200px;
        }
        
        .range-value {
          min-width: 40px;
          text-align: right;
          color: var(--vscode-foreground);
        }
        
        button {
          padding: 8px 16px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        
        .button-group {
          display: flex;
          gap: 10px;
        }
        
        .reset-button {
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        
        .reset-button:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .tag {
          display: inline-block;
          padding: 2px 8px;
          background-color: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          margin-left: 8px;
        }
        
        .experimental-tag {
          background-color: var(--vscode-editorWarning-foreground);
          color: var(--vscode-editor-background);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>⚙️ Claude Code Settings</h1>
        <div class="button-group">
          <button class="reset-button" onclick="resetDefaults()">Reset to Defaults</button>
          <button onclick="openInVSCodeSettings()">Open in VS Code Settings</button>
        </div>
      </div>
      
      <div class="search-container">
        <input 
          type="text" 
          class="search-input" 
          placeholder="Search settings..." 
          oninput="searchSettings(this.value)"
        />
      </div>
      
      <div id="settings-container">
        ${this._renderSettingsCategories(settings)}
      </div>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        function updateSetting(setting, value) {
          vscode.postMessage({
            command: 'updateSetting',
            setting: setting,
            value: value
          });
        }
        
        function resetDefaults() {
          vscode.postMessage({
            command: 'resetDefaults'
          });
        }
        
        function openInVSCodeSettings() {
          vscode.postMessage({
            command: 'openInSettings',
            setting: 'continue-cc'
          });
        }
        
        function searchSettings(query) {
          vscode.postMessage({
            command: 'search',
            query: query
          });
          
          // Local search implementation
          const allSettings = document.querySelectorAll('.setting-item');
          const categories = document.querySelectorAll('.settings-category');
          
          if (query.trim() === '') {
            allSettings.forEach(setting => setting.style.display = 'block');
            categories.forEach(category => category.style.display = 'block');
            return;
          }
          
          const lowerQuery = query.toLowerCase();
          
          categories.forEach(category => {
            let hasVisibleSettings = false;
            const settings = category.querySelectorAll('.setting-item');
            
            settings.forEach(setting => {
              const label = setting.querySelector('.setting-label').textContent.toLowerCase();
              const description = setting.querySelector('.setting-description').textContent.toLowerCase();
              
              if (label.includes(lowerQuery) || description.includes(lowerQuery)) {
                setting.style.display = 'block';
                hasVisibleSettings = true;
              } else {
                setting.style.display = 'none';
              }
            });
            
            category.style.display = hasVisibleSettings ? 'block' : 'none';
          });
        }
        
        function toggleCategory(categoryId) {
          const content = document.getElementById(categoryId);
          const chevron = document.getElementById(categoryId + '-chevron');
          
          content.classList.toggle('collapsed');
          chevron.classList.toggle('collapsed');
        }
        
        function updateRangeValue(inputId, valueId) {
          const input = document.getElementById(inputId);
          const value = document.getElementById(valueId);
          value.textContent = input.value;
        }
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          
          switch (message.command) {
            case 'updateSettings':
              // Update UI with new settings values
              location.reload();
              break;
            case 'searchResults':
              // Handle search results
              break;
          }
        });
      </script>
    </body>
    </html>`;
  }

  private _renderSettingsCategories(settings: any): string {
    return `
      ${this._renderGeneralSettings(settings.general)}
      ${this._renderAutocompleteSettings(settings.autocomplete)}
      ${this._renderLanguageSettings(settings.languages)}
      ${this._renderPerformanceSettings(settings.performance)}
      ${this._renderAdvancedSettings(settings.advanced)}
      ${this._renderPrivacySettings(settings.telemetry, settings.privacy)}
      ${this._renderExperimentalSettings(settings.experimental)}
    `;
  }

  private _renderGeneralSettings(general: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('general-content')">
          <h2 class="category-title">
            <span class="chevron" id="general-content-chevron">▼</span>
            General
          </h2>
        </div>
        <div class="category-content" id="general-content">
          <div class="setting-item">
            <div class="setting-label">Enable Claude Code Continue</div>
            <div class="setting-description">Enable or disable the entire extension</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${general.enable ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.enable', this.checked)"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderAutocompleteSettings(autocomplete: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('autocomplete-content')">
          <h2 class="category-title">
            <span class="chevron" id="autocomplete-content-chevron">▼</span>
            Autocomplete
          </h2>
        </div>
        <div class="category-content" id="autocomplete-content">
          <div class="setting-item">
            <div class="setting-label">Enable Autocomplete</div>
            <div class="setting-description">Enable AI-powered code completions</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${autocomplete.enabled ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.autocomplete.enabled', this.checked)"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Automatic Trigger</div>
            <div class="setting-description">Automatically trigger completions while typing</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${autocomplete.automaticTrigger ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.autocomplete.automaticTrigger', this.checked)"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Completion Delay</div>
            <div class="setting-description">Delay in milliseconds before requesting completions</div>
            <div class="setting-control">
              <input 
                type="range" 
                id="completion-delay"
                min="0" 
                max="1000" 
                value="${autocomplete.completionDelay}"
                oninput="updateRangeValue('completion-delay', 'completion-delay-value')"
                onchange="updateSetting('continue-cc.autocomplete.completionDelay', parseInt(this.value))"
              />
              <span class="range-value" id="completion-delay-value">${autocomplete.completionDelay}</span>ms
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Minimum Characters</div>
            <div class="setting-description">Minimum number of characters before triggering completions</div>
            <div class="setting-control">
              <input 
                type="number" 
                min="1" 
                max="10" 
                value="${autocomplete.minimumCharacters}"
                onchange="updateSetting('continue-cc.autocomplete.minimumCharacters', parseInt(this.value))"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Disable in Comments</div>
            <div class="setting-description">Disable completions inside comments</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${autocomplete.disableInComments ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.autocomplete.disableInComments', this.checked)"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Disable in Strings</div>
            <div class="setting-description">Disable completions inside strings</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${autocomplete.disableInStrings ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.autocomplete.disableInStrings', this.checked)"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderLanguageSettings(languages: any): string {
    // Simplified for brevity - would render all language settings
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('languages-content')">
          <h2 class="category-title">
            <span class="chevron" id="languages-content-chevron">▼</span>
            Language-specific Settings
          </h2>
        </div>
        <div class="category-content collapsed" id="languages-content">
          <p style="color: var(--vscode-descriptionForeground);">
            Configure completion behavior for specific programming languages
          </p>
        </div>
      </div>
    `;
  }

  private _renderPerformanceSettings(performance: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('performance-content')">
          <h2 class="category-title">
            <span class="chevron" id="performance-content-chevron">▼</span>
            Performance
          </h2>
        </div>
        <div class="category-content collapsed" id="performance-content">
          <div class="setting-item">
            <div class="setting-label">Enable Caching</div>
            <div class="setting-description">Cache completion results for better performance</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${performance.enableCaching ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.performance.enableCaching', this.checked)"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Cache TTL</div>
            <div class="setting-description">Cache time-to-live in milliseconds</div>
            <div class="setting-control">
              <input 
                type="number" 
                min="60000" 
                max="3600000" 
                step="60000"
                value="${performance.cacheTTL}"
                onchange="updateSetting('continue-cc.performance.cacheTTL', parseInt(this.value))"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderAdvancedSettings(advanced: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('advanced-content')">
          <h2 class="category-title">
            <span class="chevron" id="advanced-content-chevron">▼</span>
            Advanced
          </h2>
        </div>
        <div class="category-content collapsed" id="advanced-content">
          <div class="setting-item">
            <div class="setting-label">Context Window</div>
            <div class="setting-description">Maximum context window size in tokens</div>
            <div class="setting-control">
              <input 
                type="range" 
                id="context-window"
                min="1000" 
                max="8000" 
                step="500"
                value="${advanced.contextWindow}"
                oninput="updateRangeValue('context-window', 'context-window-value')"
                onchange="updateSetting('continue-cc.advanced.contextWindow', parseInt(this.value))"
              />
              <span class="range-value" id="context-window-value">${advanced.contextWindow}</span>
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Temperature</div>
            <div class="setting-description">Model temperature for completions (0-1)</div>
            <div class="setting-control">
              <input 
                type="range" 
                id="temperature"
                min="0" 
                max="1" 
                step="0.1"
                value="${advanced.temperature}"
                oninput="updateRangeValue('temperature', 'temperature-value')"
                onchange="updateSetting('continue-cc.advanced.temperature', parseFloat(this.value))"
              />
              <span class="range-value" id="temperature-value">${advanced.temperature}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderPrivacySettings(telemetry: any, privacy: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('privacy-content')">
          <h2 class="category-title">
            <span class="chevron" id="privacy-content-chevron">▼</span>
            Privacy & Telemetry
          </h2>
        </div>
        <div class="category-content collapsed" id="privacy-content">
          <div class="setting-item">
            <div class="setting-label">Enable Telemetry</div>
            <div class="setting-description">Send anonymous usage statistics to improve the extension</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${telemetry.enabled ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.telemetry.enabled', this.checked)"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <div class="setting-label">Mask Sensitive Data</div>
            <div class="setting-description">Mask potentially sensitive data in completions</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${privacy.maskSensitiveData ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.privacy.maskSensitiveData', this.checked)"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderExperimentalSettings(experimental: any): string {
    return `
      <div class="settings-category">
        <div class="category-header" onclick="toggleCategory('experimental-content')">
          <h2 class="category-title">
            <span class="chevron" id="experimental-content-chevron">▼</span>
            Experimental
            <span class="tag experimental-tag">BETA</span>
          </h2>
        </div>
        <div class="category-content collapsed" id="experimental-content">
          <div class="setting-item">
            <div class="setting-label">Enable Beta Features</div>
            <div class="setting-description">Enable experimental features that may be unstable</div>
            <div class="setting-control">
              <input 
                type="checkbox" 
                ${experimental.enableBetaFeatures ? 'checked' : ''} 
                onchange="updateSetting('continue-cc.experimental.enableBetaFeatures', this.checked)"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
