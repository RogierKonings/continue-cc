import type { ModeDetectionContext } from './completionModes';
import { CompletionMode } from './completionModes';

export class ModeDetector {
  private static readonly LINE_TRIGGERS = [
    /[=+\-*/%<>!&|^~]$/, // Operators
    /\.\s*$/, // Property access
    /\(\s*$/, // Function call
    /,\s*$/, // Parameter/array continuation
    /:\s*$/, // Object property or type annotation
    /return\s+$/, // Return statement
    /^\s*(const|let|var)\s+\w+\s*=\s*$/, // Variable assignment
  ];

  private static readonly BLOCK_TRIGGERS = [
    /{\s*$/, // Opening brace
    /^\s*(if|else|while|for|do|switch)\s*\(/, // Control structures
    /^\s*(try|catch|finally)\s*/, // Exception handling
    /^\s*case\s+.*:\s*$/, // Switch case
    /=>\s*{\s*$/, // Arrow function block
  ];

  private static readonly FUNCTION_TRIGGERS = [
    /^\s*(async\s+)?function\s+\w+\s*\([^)]*\)\s*{\s*$/, // Function declaration
    /^\s*(public|private|protected)?\s*(static\s+)?\w+\s*\([^)]*\)\s*{\s*$/, // Method declaration
    /^\s*\w+\s*:\s*(async\s+)?\([^)]*\)\s*=>\s*{\s*$/, // Arrow function property
    /^\s*(get|set)\s+\w+\s*\(\)\s*{\s*$/, // Getter/setter
    /^\s*constructor\s*\([^)]*\)\s*{\s*$/, // Constructor
  ];

  private static readonly DOCUMENTATION_TRIGGERS = [
    /^\s*\/\*\*\s*$/, // JSDoc start
    /^\s*"""\s*$/, // Python docstring
    /^\s*\/\/\/\s*$/, // Triple slash comment
    /^\s*#\s*$/, // Markdown header in comment
  ];

  static detectMode(context: ModeDetectionContext): CompletionMode {
    const { currentLine, previousLine, languageId } = context;

    // Check for documentation mode
    if (this.isDocumentationContext(currentLine, previousLine)) {
      return CompletionMode.DOCUMENTATION;
    }

    // Check for function mode
    if (this.isFunctionContext(currentLine, previousLine)) {
      return CompletionMode.FUNCTION;
    }

    // Check for block mode
    if (this.isBlockContext(currentLine, previousLine)) {
      return CompletionMode.BLOCK;
    }

    // Check for line mode
    if (this.isLineContext(currentLine)) {
      return CompletionMode.LINE;
    }

    // Default to auto mode
    return CompletionMode.AUTO;
  }

  private static isDocumentationContext(currentLine: string, previousLine: string): boolean {
    return (
      this.DOCUMENTATION_TRIGGERS.some((trigger) => trigger.test(currentLine)) ||
      this.DOCUMENTATION_TRIGGERS.some((trigger) => trigger.test(previousLine))
    );
  }

  private static isFunctionContext(currentLine: string, previousLine: string): boolean {
    return (
      this.FUNCTION_TRIGGERS.some((trigger) => trigger.test(currentLine)) ||
      (!!previousLine && this.FUNCTION_TRIGGERS.some((trigger) => trigger.test(previousLine)))
    );
  }

  private static isBlockContext(currentLine: string, previousLine: string): boolean {
    return (
      this.BLOCK_TRIGGERS.some((trigger) => trigger.test(currentLine)) ||
      (!!previousLine && this.BLOCK_TRIGGERS.some((trigger) => trigger.test(previousLine)))
    );
  }

  private static isLineContext(currentLine: string): boolean {
    return this.LINE_TRIGGERS.some((trigger) => trigger.test(currentLine));
  }

  static detectFromPosition(
    document: string,
    position: { line: number; character: number },
    languageId: string
  ): CompletionMode {
    const lines = document.split('\n');
    const currentLine = lines[position.line] || '';
    const previousLine = position.line > 0 ? lines[position.line - 1] : '';
    const nextLine = position.line < lines.length - 1 ? lines[position.line + 1] : '';

    const context: ModeDetectionContext = {
      currentLine: currentLine.substring(0, position.character),
      previousLine,
      nextLine,
      cursorPosition: position.character,
      languageId,
      fileContent: document,
      lineNumber: position.line,
    };

    return this.detectMode(context);
  }
}
