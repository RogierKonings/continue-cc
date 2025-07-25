import * as vscode from 'vscode';

export class QuickActionsProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
    vscode.CodeActionKind.RefactorExtract,
    vscode.CodeActionKind.RefactorInline,
    vscode.CodeActionKind.RefactorRewrite,
  ];

  constructor(private context: vscode.ExtensionContext) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const actions: vscode.CodeAction[] = [];

    // Add completion-related quick fixes
    if (this.isCompletionApplicable(document, range)) {
      const triggerCompletionAction = this.createTriggerCompletionAction(document, range);
      actions.push(triggerCompletionAction);
    }

    // Add refactoring actions
    if (!range.isEmpty) {
      const explainCodeAction = this.createExplainCodeAction(document, range);
      const improveCodeAction = this.createImproveCodeAction(document, range);
      const generateTestsAction = this.createGenerateTestsAction(document, range);

      actions.push(explainCodeAction, improveCodeAction, generateTestsAction);
    }

    // Add fix actions for diagnostics
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'Claude Code') {
        const fixAction = this.createFixAction(document, diagnostic);
        if (fixAction) {
          actions.push(fixAction);
        }
      }
    }

    return actions;
  }

  private isCompletionApplicable(document: vscode.TextDocument, range: vscode.Range): boolean {
    // Check if we're at a position where completion makes sense
    const line = document.lineAt(range.start.line);
    const textBeforeCursor = line.text.substring(0, range.start.character);

    // Don't suggest completion in comments or strings (simplified check)
    const inString = (textBeforeCursor.match(/"/g) || []).length % 2 === 1;
    const inComment = textBeforeCursor.includes('//') || textBeforeCursor.includes('/*');

    return !inString && !inComment;
  }

  private createTriggerCompletionAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Trigger Claude Code Completion',
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: 'continue-cc.triggerCompletion',
      title: 'Trigger Completion',
      arguments: [],
    };

    return action;
  }

  private createExplainCodeAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Explain Code with Claude',
      vscode.CodeActionKind.RefactorExtract
    );

    action.command = {
      command: 'continue-cc.explainCode',
      title: 'Explain Code',
      arguments: [document, range],
    };

    return action;
  }

  private createImproveCodeAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Improve Code with Claude',
      vscode.CodeActionKind.RefactorRewrite
    );

    action.command = {
      command: 'continue-cc.improveCode',
      title: 'Improve Code',
      arguments: [document, range],
    };

    return action;
  }

  private createGenerateTestsAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Generate Tests with Claude',
      vscode.CodeActionKind.Refactor
    );

    action.command = {
      command: 'continue-cc.generateTests',
      title: 'Generate Tests',
      arguments: [document, range],
    };

    return action;
  }

  private createFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction | undefined {
    const action = new vscode.CodeAction(
      `Fix: ${diagnostic.message}`,
      vscode.CodeActionKind.QuickFix
    );

    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    // This would connect to the Claude API to get a fix suggestion
    action.command = {
      command: 'continue-cc.applyQuickFix',
      title: 'Apply Quick Fix',
      arguments: [document, diagnostic],
    };

    return action;
  }
}

export function registerQuickActions(context: vscode.ExtensionContext): void {
  const provider = new QuickActionsProvider(context);

  // Register for all supported languages
  const languages = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'python',
    'java',
    'cpp',
    'c',
    'csharp',
    'go',
    'ruby',
    'php',
    'swift',
  ];

  const disposable = vscode.languages.registerCodeActionsProvider(languages, provider, {
    providedCodeActionKinds: QuickActionsProvider.providedCodeActionKinds,
  });

  context.subscriptions.push(disposable);

  // Register the commands referenced by code actions
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'continue-cc.explainCode',
      async (document: vscode.TextDocument, range: vscode.Range) => {
        const selectedText = document.getText(range);
        vscode.window.showInformationMessage(
          `Claude would explain this code:\n${selectedText.substring(0, 50)}...`,
          { modal: true }
        );
      }
    ),

    vscode.commands.registerCommand(
      'continue-cc.improveCode',
      async (document: vscode.TextDocument, range: vscode.Range) => {
        const selectedText = document.getText(range);
        vscode.window.showInformationMessage(
          `Claude would suggest improvements for:\n${selectedText.substring(0, 50)}...`,
          { modal: true }
        );
      }
    ),

    vscode.commands.registerCommand(
      'continue-cc.generateTests',
      async (document: vscode.TextDocument, range: vscode.Range) => {
        const selectedText = document.getText(range);
        vscode.window.showInformationMessage(
          `Claude would generate tests for:\n${selectedText.substring(0, 50)}...`,
          { modal: true }
        );
      }
    ),

    vscode.commands.registerCommand(
      'continue-cc.applyQuickFix',
      async (document: vscode.TextDocument, diagnostic: vscode.Diagnostic) => {
        vscode.window.showInformationMessage(`Claude would fix: ${diagnostic.message}`, {
          modal: true,
        });
      }
    )
  );
}
