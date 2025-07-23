import * as vscode from 'vscode';

interface BracketPair {
  open: string;
  close: string;
  shouldAutoClose: boolean;
}

export class BracketMatcher {
  private static readonly bracketPairs: BracketPair[] = [
    { open: '(', close: ')', shouldAutoClose: true },
    { open: '[', close: ']', shouldAutoClose: true },
    { open: '{', close: '}', shouldAutoClose: true },
    { open: '<', close: '>', shouldAutoClose: false }, // Only in specific contexts
    { open: '"', close: '"', shouldAutoClose: true },
    { open: "'", close: "'", shouldAutoClose: true },
    { open: '`', close: '`', shouldAutoClose: true },
  ];

  static getMatchingBracket(openBracket: string): string | undefined {
    const pair = this.bracketPairs.find((p) => p.open === openBracket);
    return pair?.close;
  }

  static isOpenBracket(char: string): boolean {
    return this.bracketPairs.some((p) => p.open === char);
  }

  static isCloseBracket(char: string): boolean {
    return this.bracketPairs.some((p) => p.close === char);
  }

  static shouldAutoClose(
    openBracket: string,
    context: { language: string; position: vscode.Position; document: vscode.TextDocument }
  ): boolean {
    const pair = this.bracketPairs.find((p) => p.open === openBracket);
    if (!pair?.shouldAutoClose) return false;

    // Special handling for angle brackets in TypeScript/TSX
    if (openBracket === '<') {
      return this.isGenericContext(context);
    }

    // Don't auto-close if the closing bracket already exists
    const line = context.document.lineAt(context.position.line).text;
    const afterCursor = line.substring(context.position.character);
    if (afterCursor.startsWith(pair.close)) {
      return false;
    }

    return true;
  }

  static isGenericContext(context: {
    language: string;
    position: vscode.Position;
    document: vscode.TextDocument;
  }): boolean {
    // Only in TypeScript/TSX files
    if (!['typescript', 'typescriptreact'].includes(context.language)) {
      return false;
    }

    const line = context.document.lineAt(context.position.line).text;
    const beforeCursor = line.substring(0, context.position.character);

    // Check for generic patterns
    const genericPatterns = [
      /\b(?:extends|implements|class|interface|type|function|const|let|var)\s+\w+$/,
      /:\s*\w+$/,
      /=>\s*\w+$/,
      /new\s+\w+$/,
    ];

    return genericPatterns.some((pattern) => pattern.test(beforeCursor));
  }

  static getSmartBracketCompletion(
    openBracket: string,
    context: {
      language: string;
      position: vscode.Position;
      document: vscode.TextDocument;
      currentLine: string;
    }
  ): string | undefined {
    const closeBracket = this.getMatchingBracket(openBracket);
    if (!closeBracket || !this.shouldAutoClose(openBracket, context)) {
      return undefined;
    }

    // For quotes, check if we're inside a string
    if (['"', "'", '`'].includes(openBracket)) {
      if (this.isInsideString(context)) {
        return undefined;
      }
    }

    // Smart completion based on context
    switch (openBracket) {
      case '(':
        return this.getParenthesisCompletion(context);
      case '{':
        return this.getBraceCompletion(context);
      case '[':
        return this.getBracketCompletion(context);
      default:
        return closeBracket;
    }
  }

  private static getParenthesisCompletion(context: {
    currentLine: string;
    position: vscode.Position;
  }): string {
    const beforeCursor = context.currentLine.substring(0, context.position.character);

    // Function call - add closing parenthesis with cursor inside
    if (/\w+\s*\($/.test(beforeCursor)) {
      return ')';
    }

    // Control structures
    if (/\b(if|while|for|switch)\s*\($/.test(beforeCursor)) {
      return ')';
    }

    return ')';
  }

  private static getBraceCompletion(context: {
    currentLine: string;
    position: vscode.Position;
    document: vscode.TextDocument;
  }): string {
    const beforeCursor = context.currentLine.substring(0, context.position.character);
    const indentation = context.currentLine.match(/^\s*/)?.[0] || '';

    // Object literal
    if (/[=:]\s*{$/.test(beforeCursor)) {
      return `\n${indentation}\t$1\n${indentation}}`;
    }

    // Function/class body
    if (/\)\s*{$/.test(beforeCursor) || /\bclass\s+\w+.*{$/.test(beforeCursor)) {
      return `\n${indentation}\t$1\n${indentation}}`;
    }

    return '}';
  }

  private static getBracketCompletion(context: {
    currentLine: string;
    position: vscode.Position;
  }): string {
    const beforeCursor = context.currentLine.substring(0, context.position.character);

    // Array literal
    if (/[=:]\s*\[$/.test(beforeCursor)) {
      return ']';
    }

    // Array access
    if (/\w+\[$/.test(beforeCursor)) {
      return ']';
    }

    return ']';
  }

  private static isInsideString(context: {
    document: vscode.TextDocument;
    position: vscode.Position;
  }): boolean {
    const line = context.document.lineAt(context.position.line).text;
    const beforeCursor = line.substring(0, context.position.character);

    // Count quotes before cursor
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    const backticks = (beforeCursor.match(/`/g) || []).length;

    // If odd number of quotes, we're inside a string
    return singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1;
  }

  static countUnmatchedBrackets(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    const stack: string[] = [];

    for (const char of text) {
      if (this.isOpenBracket(char)) {
        stack.push(char);
      } else if (this.isCloseBracket(char)) {
        const matchingOpen = this.bracketPairs.find((p) => p.close === char)?.open;
        if (matchingOpen && stack[stack.length - 1] === matchingOpen) {
          stack.pop();
        } else {
          // Unmatched closing bracket
          counts.set(char, (counts.get(char) || 0) + 1);
        }
      }
    }

    // Count remaining open brackets
    for (const bracket of stack) {
      counts.set(bracket, (counts.get(bracket) || 0) + 1);
    }

    return counts;
  }
}
