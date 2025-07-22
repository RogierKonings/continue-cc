import * as vscode from 'vscode';

export class AuthWebviewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async showTokenEntryWebview(): Promise<string | undefined> {
    const panel = vscode.window.createWebviewPanel(
      'claudeCodeAuth',
      'Claude Code Authentication',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.getWebviewContent(panel.webview);

    return new Promise((resolve) => {
      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'submitToken':
              panel.dispose();
              resolve(message.token);
              break;
            case 'cancel':
              panel.dispose();
              resolve(undefined);
              break;
          }
        },
        undefined,
        this.context.subscriptions
      );

      panel.onDidDispose(() => {
        resolve(undefined);
      });
    });
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'auth.css')
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'auth.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <title>Claude Code Authentication</title>
      <style>
        body {
          padding: 20px;
          font-family: var(--vscode-font-family);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
        }
        
        h1 {
          color: var(--vscode-editor-foreground);
          margin-bottom: 20px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }
        
        input[type="text"], textarea {
          width: 100%;
          padding: 8px 12px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-family: 'Consolas', 'Courier New', monospace;
        }
        
        textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        .button-group {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: opacity 0.2s;
        }
        
        .primary-button {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        
        .primary-button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        
        .secondary-button {
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        
        .secondary-button:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .error-message {
          color: var(--vscode-errorForeground);
          margin-top: 10px;
          display: none;
        }
        
        .info-box {
          background-color: var(--vscode-textBlockQuote-background);
          border-left: 4px solid var(--vscode-textLink-foreground);
          padding: 12px;
          margin-bottom: 20px;
        }
        
        .loading {
          display: none;
          text-align: center;
          margin: 20px 0;
        }
        
        .spinner {
          border: 3px solid var(--vscode-progressBar-background);
          border-top: 3px solid var(--vscode-progressBar-foreground);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Authenticate with Claude Code</h1>
        
        <div class="info-box">
          <strong>Manual Token Entry</strong><br>
          Enter your Claude Code API token below. You can obtain a token from your 
          <a href="https://console.anthropic.com/account/keys">Anthropic Console</a>.
        </div>
        
        <form id="authForm">
          <div class="form-group">
            <label for="token">API Token</label>
            <textarea 
              id="token" 
              name="token" 
              placeholder="Enter your Claude Code API token here..."
              required
            ></textarea>
            <div id="errorMessage" class="error-message"></div>
          </div>
          
          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Validating token...</p>
          </div>
          
          <div class="button-group">
            <button type="button" class="secondary-button" id="cancelButton">
              Cancel
            </button>
            <button type="submit" class="primary-button" id="submitButton">
              Authenticate
            </button>
          </div>
        </form>
      </div>
      
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('authForm');
        const tokenInput = document.getElementById('token');
        const submitButton = document.getElementById('submitButton');
        const cancelButton = document.getElementById('cancelButton');
        const errorMessage = document.getElementById('errorMessage');
        const loading = document.getElementById('loading');
        
        function showError(message) {
          errorMessage.textContent = message;
          errorMessage.style.display = 'block';
        }
        
        function hideError() {
          errorMessage.style.display = 'none';
        }
        
        function setLoading(isLoading) {
          loading.style.display = isLoading ? 'block' : 'none';
          submitButton.disabled = isLoading;
          cancelButton.disabled = isLoading;
          tokenInput.disabled = isLoading;
        }
        
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          
          const token = tokenInput.value.trim();
          
          if (!token) {
            showError('Please enter a valid API token');
            return;
          }
          
          hideError();
          setLoading(true);
          
          // Simulate validation delay
          setTimeout(() => {
            vscode.postMessage({
              command: 'submitToken',
              token: token
            });
          }, 500);
        });
        
        cancelButton.addEventListener('click', () => {
          vscode.postMessage({
            command: 'cancel'
          });
        });
        
        tokenInput.addEventListener('input', () => {
          hideError();
        });
      </script>
    </body>
    </html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}