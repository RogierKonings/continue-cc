import * as vscode from 'vscode';
import type { ModeConfiguration } from './completionModes';
import { CompletionMode } from './completionModes';
import { ModeDetector } from './modeDetector';
import { LineCompletionProvider } from './lineCompletionProvider';
import { BlockCompletionProvider } from './blockCompletionProvider';
import { FunctionCompletionProvider } from './functionCompletionProvider';
import { DocumentationCompletionProvider } from './documentationCompletionProvider';

export class CompletionModeManager {
  private currentMode: CompletionMode = CompletionMode.AUTO;
  private manualModeOverride: CompletionMode | null = null;
  private statusBarItem: vscode.StatusBarItem;

  private readonly providers: Map<CompletionMode, CompletionProvider>;

  constructor() {
    // Initialize providers
    this.providers = new Map<CompletionMode, CompletionProvider>();
    this.providers.set(CompletionMode.LINE, new LineCompletionProvider() as CompletionProvider);
    this.providers.set(CompletionMode.BLOCK, new BlockCompletionProvider() as CompletionProvider);
    this.providers.set(
      CompletionMode.FUNCTION,
      new FunctionCompletionProvider() as CompletionProvider
    );
    this.providers.set(
      CompletionMode.DOCUMENTATION,
      new DocumentationCompletionProvider() as CompletionProvider
    );

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'continue-cc.switchCompletionMode';
    this.updateStatusBar();
    this.statusBarItem.show();
  }

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken,
    apiClient: any // ClaudeCodeAPIClient type
  ): Promise<vscode.CompletionItem[]> {
    // Determine the completion mode
    const mode = this.determineMode(document, position);
    this.currentMode = mode;
    this.updateStatusBar();

    // Get provider for the mode
    const provider = this.providers.get(mode);

    if (!provider) {
      // For AUTO mode, detect and use appropriate provider
      const detectedMode = ModeDetector.detectFromPosition(
        document.getText(),
        position,
        document.languageId
      );

      const autoProvider = this.providers.get(detectedMode);
      if (autoProvider) {
        return autoProvider.provideCompletions(document, position, context, token);
      }

      // Fallback to line mode
      return this.providers
        .get(CompletionMode.LINE)!
        .provideCompletions(document, position, context, token);
    }

    return provider.provideCompletions(document, position, context, token);
  }

  private determineMode(document: vscode.TextDocument, position: vscode.Position): CompletionMode {
    // If manual override is set, use it
    if (this.manualModeOverride) {
      return this.manualModeOverride;
    }

    // Otherwise, auto-detect
    return ModeDetector.detectFromPosition(document.getText(), position, document.languageId);
  }

  setMode(mode: CompletionMode): void {
    if (mode === CompletionMode.AUTO) {
      this.manualModeOverride = null;
    } else {
      this.manualModeOverride = mode;
    }
    this.currentMode = mode;
    this.updateStatusBar();
  }

  getCurrentMode(): CompletionMode {
    return this.currentMode;
  }

  getConfiguration(mode: CompletionMode): ModeConfiguration | undefined {
    const provider = this.providers.get(mode);
    return provider?.getConfiguration();
  }

  private updateStatusBar(): void {
    const modeDisplay = this.getModeDisplay(this.currentMode);
    this.statusBarItem.text = `$(code) ${modeDisplay}`;
    this.statusBarItem.tooltip = this.getModeTooltip(this.currentMode);
  }

  private getModeDisplay(mode: CompletionMode): string {
    const displays = {
      [CompletionMode.LINE]: 'Line',
      [CompletionMode.BLOCK]: 'Block',
      [CompletionMode.FUNCTION]: 'Function',
      [CompletionMode.DOCUMENTATION]: 'Docs',
      [CompletionMode.AUTO]: 'Auto',
    };
    return displays[mode] || 'Auto';
  }

  private getModeTooltip(mode: CompletionMode): string {
    const tooltips = {
      [CompletionMode.LINE]: 'Line completion mode - completes single lines',
      [CompletionMode.BLOCK]: 'Block completion mode - completes code blocks',
      [CompletionMode.FUNCTION]: 'Function completion mode - generates function bodies',
      [CompletionMode.DOCUMENTATION]: 'Documentation mode - generates comments and docs',
      [CompletionMode.AUTO]: 'Automatic mode detection',
    };

    let tooltip = tooltips[mode] || 'Unknown mode';

    if (this.manualModeOverride) {
      tooltip += ' (manual override)';
    }

    tooltip += '\nClick to switch completion mode';

    return tooltip;
  }

  async showModeQuickPick(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(symbol-misc) Auto',
        description: 'Automatically detect completion mode',
        detail: this.currentMode === CompletionMode.AUTO ? 'Currently active' : undefined,
      },
      {
        label: '$(dash) Line',
        description: 'Complete single lines of code',
        detail: this.currentMode === CompletionMode.LINE ? 'Currently active' : undefined,
      },
      {
        label: '$(symbol-namespace) Block',
        description: 'Complete code blocks (if/else, loops, etc.)',
        detail: this.currentMode === CompletionMode.BLOCK ? 'Currently active' : undefined,
      },
      {
        label: '$(symbol-method) Function',
        description: 'Generate function implementations',
        detail: this.currentMode === CompletionMode.FUNCTION ? 'Currently active' : undefined,
      },
      {
        label: '$(comment) Documentation',
        description: 'Generate documentation and comments',
        detail: this.currentMode === CompletionMode.DOCUMENTATION ? 'Currently active' : undefined,
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select completion mode',
      title: 'Completion Mode',
    });

    if (selected) {
      const modeMap: Record<string, CompletionMode> = {
        Auto: CompletionMode.AUTO,
        Line: CompletionMode.LINE,
        Block: CompletionMode.BLOCK,
        Function: CompletionMode.FUNCTION,
        Documentation: CompletionMode.DOCUMENTATION,
      };

      const modeName = selected.label.split(' ')[1];
      const newMode = modeMap[modeName];

      if (newMode) {
        this.setMode(newMode);
        vscode.window.showInformationMessage(`Switched to ${modeName} completion mode`);
      }
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}

interface CompletionProvider {
  provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]>;

  getConfiguration(): ModeConfiguration;
}
