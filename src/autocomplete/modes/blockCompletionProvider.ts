import * as vscode from 'vscode';
import { CompletionMode, ModeConfiguration, MODE_CONFIGURATIONS } from './completionModes';

export class BlockCompletionProvider {
  private readonly config: ModeConfiguration;

  constructor() {
    this.config = MODE_CONFIGURATIONS[CompletionMode.BLOCK];
  }

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const previousLine = position.line > 0 ? document.lineAt(position.line - 1).text : '';

    const completions: vscode.CompletionItem[] = [];

    // If block completion
    if (this.isIfBlock(lineText, previousLine)) {
      completions.push(...this.getIfBlockCompletions(document, position));
    }

    // Loop block completion
    if (this.isLoopBlock(lineText, previousLine)) {
      completions.push(...this.getLoopBlockCompletions(document, position));
    }

    // Try/catch block completion
    if (this.isTryCatchBlock(lineText, previousLine)) {
      completions.push(...this.getTryCatchBlockCompletions(document, position));
    }

    // Switch block completion
    if (this.isSwitchBlock(lineText, previousLine)) {
      completions.push(...this.getSwitchBlockCompletions(document, position));
    }

    // Generic block completion for nested structures
    if (this.isGenericBlock(lineText)) {
      completions.push(...this.getGenericBlockCompletions(document, position));
    }

    return completions;
  }

  private isIfBlock(currentLine: string, previousLine: string): boolean {
    return /^\s*if\s*\(/.test(currentLine) || /^\s*if\s*\(.*\)\s*{\s*$/.test(previousLine);
  }

  private isLoopBlock(currentLine: string, previousLine: string): boolean {
    return (
      /^\s*(for|while|do)\s*\(/.test(currentLine) ||
      /^\s*(for|while)\s*\(.*\)\s*{\s*$/.test(previousLine)
    );
  }

  private isTryCatchBlock(currentLine: string, previousLine: string): boolean {
    return /^\s*try\s*{/.test(currentLine) || /^\s*try\s*{\s*$/.test(previousLine);
  }

  private isSwitchBlock(currentLine: string, previousLine: string): boolean {
    return /^\s*switch\s*\(/.test(currentLine) || /^\s*switch\s*\(.*\)\s*{\s*$/.test(previousLine);
  }

  private isGenericBlock(currentLine: string): boolean {
    return /{\s*$/.test(currentLine);
  }

  private getIfBlockCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(document, position);

    // If-else block template
    const ifElseItem = new vscode.CompletionItem(
      'if-else block',
      vscode.CompletionItemKind.Snippet
    );
    ifElseItem.insertText = new vscode.SnippetString(
      `\${1:// condition logic}\n` +
        `${indent}} else {\n` +
        `${indent}  \${2:// else logic}\n` +
        `${indent}}`
    );
    ifElseItem.detail = 'Complete if-else block';
    completions.push(ifElseItem);

    // Simple if block
    const ifItem = new vscode.CompletionItem('if block', vscode.CompletionItemKind.Snippet);
    ifItem.insertText = new vscode.SnippetString(`\${1:// condition logic}\n${indent}}`);
    ifItem.detail = 'Complete if block';
    completions.push(ifItem);

    return completions;
  }

  private getLoopBlockCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(document, position);

    // For loop with index
    const forIndexItem = new vscode.CompletionItem(
      'for loop with index',
      vscode.CompletionItemKind.Snippet
    );
    forIndexItem.insertText = new vscode.SnippetString(
      `let i = 0; i < \${1:array}.length; i++) {\n` +
        `${indent}  \${2:// loop body}\n` +
        `${indent}}`
    );
    forIndexItem.detail = 'For loop with index';
    completions.push(forIndexItem);

    // For...of loop
    const forOfItem = new vscode.CompletionItem('for...of loop', vscode.CompletionItemKind.Snippet);
    forOfItem.insertText = new vscode.SnippetString(
      `const \${1:item} of \${2:array}) {\n` + `${indent}  \${3:// loop body}\n` + `${indent}}`
    );
    forOfItem.detail = 'For...of loop';
    completions.push(forOfItem);

    // While loop
    const whileItem = new vscode.CompletionItem(
      'while loop body',
      vscode.CompletionItemKind.Snippet
    );
    whileItem.insertText = new vscode.SnippetString(`\${1:// loop body}\n${indent}}`);
    whileItem.detail = 'While loop body';
    completions.push(whileItem);

    return completions;
  }

  private getTryCatchBlockCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(document, position);

    // Try-catch block
    const tryCatchItem = new vscode.CompletionItem(
      'try-catch block',
      vscode.CompletionItemKind.Snippet
    );
    tryCatchItem.insertText = new vscode.SnippetString(
      `\${1:// code that might throw}\n` +
        `${indent}} catch (error) {\n` +
        `${indent}  \${2:console.error(error)}\n` +
        `${indent}}`
    );
    tryCatchItem.detail = 'Complete try-catch block';
    completions.push(tryCatchItem);

    // Try-catch-finally block
    const tryCatchFinallyItem = new vscode.CompletionItem(
      'try-catch-finally block',
      vscode.CompletionItemKind.Snippet
    );
    tryCatchFinallyItem.insertText = new vscode.SnippetString(
      `\${1:// code that might throw}\n` +
        `${indent}} catch (error) {\n` +
        `${indent}  \${2:console.error(error)}\n` +
        `${indent}} finally {\n` +
        `${indent}  \${3:// cleanup code}\n` +
        `${indent}}`
    );
    tryCatchFinallyItem.detail = 'Complete try-catch-finally block';
    completions.push(tryCatchFinallyItem);

    return completions;
  }

  private getSwitchBlockCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(document, position);

    // Switch case template
    const switchItem = new vscode.CompletionItem('switch cases', vscode.CompletionItemKind.Snippet);
    switchItem.insertText = new vscode.SnippetString(
      `case \${1:value1}:\n` +
        `${indent}  \${2:// code}\n` +
        `${indent}  break\n` +
        `${indent}case \${3:value2}:\n` +
        `${indent}  \${4:// code}\n` +
        `${indent}  break\n` +
        `${indent}default:\n` +
        `${indent}  \${5:// default code}\n` +
        `${indent}}`
    );
    switchItem.detail = 'Complete switch statement with cases';
    completions.push(switchItem);

    return completions;
  }

  private getGenericBlockCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = this.getIndentation(document, position);

    // Generic block completion
    const blockItem = new vscode.CompletionItem('block body', vscode.CompletionItemKind.Snippet);
    blockItem.insertText = new vscode.SnippetString(`\${1:// block content}\n${indent}}`);
    blockItem.detail = 'Complete code block';
    completions.push(blockItem);

    return completions;
  }

  private getIndentation(document: vscode.TextDocument, position: vscode.Position): string {
    const line = document.lineAt(position.line);
    const match = line.text.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  getConfiguration(): ModeConfiguration {
    return this.config;
  }
}
