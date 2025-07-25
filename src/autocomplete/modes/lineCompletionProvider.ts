import * as vscode from 'vscode';
import { CompletionMode, ModeConfiguration, MODE_CONFIGURATIONS } from './completionModes';

export class LineCompletionProvider {
  private readonly config: ModeConfiguration;

  constructor() {
    this.config = MODE_CONFIGURATIONS[CompletionMode.LINE];
  }

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line);
    const linePrefix = line.text.substring(0, position.character);
    const lineSuffix = line.text.substring(position.character);

    // Handle specific line completion patterns
    const completions: vscode.CompletionItem[] = [];

    // Expression completion
    if (this.isExpressionContext(linePrefix)) {
      completions.push(...this.getExpressionCompletions(linePrefix, lineSuffix));
    }

    // Statement completion
    if (this.isStatementContext(linePrefix)) {
      completions.push(...this.getStatementCompletions(linePrefix, lineSuffix));
    }

    // Method chain completion
    if (this.isMethodChainContext(linePrefix)) {
      completions.push(...this.getMethodChainCompletions(linePrefix, lineSuffix));
    }

    // Smart semicolon insertion
    if (this.needsSemicolon(linePrefix, lineSuffix, document.languageId)) {
      completions.push(this.createSemicolonCompletion(linePrefix));
    }

    return completions;
  }

  private isExpressionContext(linePrefix: string): boolean {
    return (
      /[=+\-*/%]\s*$/.test(linePrefix) || /return\s+/.test(linePrefix) || /\(\s*$/.test(linePrefix)
    );
  }

  private isStatementContext(linePrefix: string): boolean {
    return (
      /^\s*(const|let|var)\s+\w+\s*=?\s*$/.test(linePrefix) ||
      /^\s*(if|while|for)\s*\(\s*$/.test(linePrefix)
    );
  }

  private isMethodChainContext(linePrefix: string): boolean {
    return /\.\s*$/.test(linePrefix);
  }

  private needsSemicolon(linePrefix: string, lineSuffix: string, languageId: string): boolean {
    // Languages that typically use semicolons
    const semicolonLanguages = ['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp'];
    if (!semicolonLanguages.includes(languageId)) {
      return false;
    }

    // Check if line already has semicolon
    if (lineSuffix.trim().startsWith(';')) {
      return false;
    }

    // Check if line is a complete statement
    return (
      /^\s*(const|let|var|return|break|continue|throw)\s+/.test(linePrefix) ||
      /^\s*\w+\s*=\s*[^{]/.test(linePrefix) ||
      /\)\s*$/.test(linePrefix)
    );
  }

  private getExpressionCompletions(
    linePrefix: string,
    lineSuffix: string
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Arithmetic expressions
    if (/[+\-*/%]\s*$/.test(linePrefix)) {
      const item = new vscode.CompletionItem('expression', vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString('${1:value}');
      item.detail = 'Complete arithmetic expression';
      completions.push(item);
    }

    // Return expressions
    if (/return\s+$/.test(linePrefix)) {
      const item = new vscode.CompletionItem('value', vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString('${1:value}');
      item.detail = 'Return value';
      completions.push(item);
    }

    return completions;
  }

  private getStatementCompletions(linePrefix: string, lineSuffix: string): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Variable declarations
    if (/^\s*(const|let|var)\s+\w+\s*=?\s*$/.test(linePrefix)) {
      const item = new vscode.CompletionItem('value', vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString('${1:value}');
      item.detail = 'Variable initialization';
      completions.push(item);
    }

    return completions;
  }

  private getMethodChainCompletions(
    linePrefix: string,
    lineSuffix: string
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Common array methods
    const arrayMethods = ['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every'];
    arrayMethods.forEach((method) => {
      const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
      item.insertText = new vscode.SnippetString(`${method}(${1})`);
      item.detail = `Array method: ${method}`;
      completions.push(item);
    });

    return completions;
  }

  private createSemicolonCompletion(linePrefix: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(';', vscode.CompletionItemKind.Text);
    item.insertText = ';';
    item.detail = 'Add semicolon';
    item.sortText = '0'; // High priority
    return item;
  }

  getConfiguration(): ModeConfiguration {
    return this.config;
  }
}
