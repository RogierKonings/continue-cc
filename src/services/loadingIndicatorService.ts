import * as vscode from 'vscode';

export interface LoadingOptions {
  location?: vscode.ProgressLocation;
  title?: string;
  cancellable?: boolean;
  showInStatusBar?: boolean;
}

export class LoadingIndicatorService {
  private activeLoadingOperations = new Map<string, vscode.Disposable>();
  private loadingDecorations = new Map<string, vscode.TextEditorDecorationType>();

  constructor(
    private context: vscode.ExtensionContext,
    private statusBarService?: any // Circular dependency workaround
  ) {}

  /**
   * Show a loading indicator with progress
   */
  public async withProgress<T>(
    operationId: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>,
    options: LoadingOptions = {}
  ): Promise<T> {
    const {
      location = vscode.ProgressLocation.Window,
      title = 'Claude Code',
      cancellable = false,
      showInStatusBar = true,
    } = options;

    // Show in status bar if requested
    if (showInStatusBar && this.statusBarService) {
      this.statusBarService.showLoading(title);
    }

    try {
      return await vscode.window.withProgress(
        {
          location,
          title,
          cancellable,
        },
        async (progress, token) => {
          // Store cancellation token if needed
          if (cancellable) {
            const disposable = new vscode.Disposable(() => {
              // Cleanup on cancellation
            });
            this.activeLoadingOperations.set(operationId, disposable);

            token.onCancellationRequested(() => {
              this.cancelOperation(operationId);
            });
          }

          try {
            return await task(progress);
          } finally {
            this.activeLoadingOperations.delete(operationId);
          }
        }
      );
    } finally {
      if (showInStatusBar && this.statusBarService) {
        this.statusBarService.hideLoading();
      }
    }
  }

  /**
   * Show inline loading indicator in the editor
   */
  public showInlineLoading(
    editor: vscode.TextEditor,
    position: vscode.Position,
    message: string = 'Loading...'
  ): string {
    const loadingId = `inline-loading-${Date.now()}`;

    // Create decoration type with spinning animation
    const decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` $(sync~spin) ${message}`,
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
      },
    });

    // Apply decoration
    const range = new vscode.Range(position, position);
    editor.setDecorations(decorationType, [range]);

    // Store decoration for cleanup
    this.loadingDecorations.set(loadingId, decorationType);

    return loadingId;
  }

  /**
   * Hide inline loading indicator
   */
  public hideInlineLoading(loadingId: string): void {
    const decorationType = this.loadingDecorations.get(loadingId);
    if (decorationType) {
      decorationType.dispose();
      this.loadingDecorations.delete(loadingId);
    }
  }

  /**
   * Show a quick pick with loading state
   */
  public async showQuickPickWithLoading<T extends vscode.QuickPickItem>(
    itemsPromise: Promise<T[]>,
    options: vscode.QuickPickOptions & { loadingText?: string } = {}
  ): Promise<T | undefined> {
    const quickPick = vscode.window.createQuickPick<T>();
    quickPick.placeholder = options.placeHolder;
    quickPick.matchOnDescription = options.matchOnDescription ?? false;
    quickPick.matchOnDetail = options.matchOnDetail ?? false;
    quickPick.ignoreFocusOut = options.ignoreFocusOut ?? false;

    // Show loading state
    quickPick.busy = true;
    quickPick.enabled = false;
    quickPick.items = [
      {
        label: options.loadingText || 'Loading...',
        description: 'Please wait',
      } as T,
    ];

    quickPick.show();

    try {
      const items = await itemsPromise;
      quickPick.busy = false;
      quickPick.enabled = true;
      quickPick.items = items;

      return await new Promise<T | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          resolve(quickPick.selectedItems[0]);
          quickPick.hide();
        });

        quickPick.onDidHide(() => {
          resolve(undefined);
          quickPick.dispose();
        });
      });
    } catch (error) {
      quickPick.hide();
      throw error;
    }
  }

  /**
   * Show loading in a webview
   */
  public getWebviewLoadingHtml(message: string = 'Loading...'): string {
    return `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
      ">
        <div class="loading-spinner" style="
          width: 48px;
          height: 48px;
          border: 3px solid var(--vscode-activityBar-inactiveForeground);
          border-top-color: var(--vscode-activityBar-activeBorder);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        "></div>
        <div style="font-size: 16px;">${message}</div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
  }

  /**
   * Show a cancellable loading notification
   */
  public showLoadingNotification(message: string, onCancel?: () => void): vscode.Disposable {
    const operationId = `notification-${Date.now()}`;
    let cancelled = false;

    const promise = new Promise<void>((resolve) => {
      const checkCancellation = setInterval(() => {
        if (cancelled) {
          clearInterval(checkCancellation);
          resolve();
        }
      }, 100);
    });

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: message,
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          cancelled = true;
          onCancel?.();
        });

        progress.report({ increment: -1 }); // Indeterminate progress
        await promise;
      }
    );

    return new vscode.Disposable(() => {
      cancelled = true;
    });
  }

  /**
   * Create a progress indicator for long-running operations
   */
  public createProgressReporter(
    title: string,
    totalSteps: number,
    cancellable: boolean = false
  ): ProgressReporter {
    return new ProgressReporter(title, totalSteps, cancellable);
  }

  /**
   * Cancel an active loading operation
   */
  private cancelOperation(operationId: string): void {
    const operation = this.activeLoadingOperations.get(operationId);
    if (operation) {
      operation.dispose();
      this.activeLoadingOperations.delete(operationId);
    }
  }

  /**
   * Clean up all active loading indicators
   */
  public dispose(): void {
    // Clean up all active operations
    this.activeLoadingOperations.forEach((op) => op.dispose());
    this.activeLoadingOperations.clear();

    // Clean up all decorations
    this.loadingDecorations.forEach((dec) => dec.dispose());
    this.loadingDecorations.clear();
  }
}

/**
 * Progress reporter for multi-step operations
 */
export class ProgressReporter {
  private currentStep = 0;
  private progressPromise: Promise<void>;
  private progressResolve!: () => void;
  private progress!: vscode.Progress<{ message?: string; increment?: number }>;

  constructor(
    private title: string,
    private totalSteps: number,
    private cancellable: boolean = false
  ) {
    this.progressPromise = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: this.title,
        cancellable: this.cancellable,
      },
      async (progress) => {
        this.progress = progress;
        progress.report({ increment: 0 });

        return new Promise<void>((resolve) => {
          this.progressResolve = resolve;
        });
      }
    ) as Promise<void>;
  }

  public report(message: string, increment: boolean = true): void {
    if (increment) {
      this.currentStep++;
    }

    const percentIncrement = increment ? 100 / this.totalSteps : 0;

    this.progress.report({
      message: `(${this.currentStep}/${this.totalSteps}) ${message}`,
      increment: percentIncrement,
    });
  }

  public updateMessage(message: string): void {
    this.report(message, false);
  }

  public complete(message?: string): void {
    if (message) {
      this.progress.report({ message });
    }
    this.progressResolve();
  }

  public async wait(): Promise<void> {
    return this.progressPromise;
  }
}
