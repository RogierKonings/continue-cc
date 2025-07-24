import * as vscode from 'vscode';
import type { CodeContext } from '../context/contextExtractor';
import { Logger } from '../../utils/logger';
import { BracketMatcher } from '../utils/bracketMatcher';

interface PendingRequest {
  abortController: AbortController;
  promise: Promise<any>;
  timestamp: number;
}

export class DebouncedCompletionManager {
  private readonly logger: Logger;
  private debounceTimer: NodeJS.Timeout | undefined;
  private pendingRequests: Map<string, PendingRequest>;
  private typingSpeed: number = 0;
  private lastTypeTime: number = 0;

  // Configuration
  private readonly minDebounceDelay = 100;
  private readonly maxDebounceDelay = 300;
  private readonly immediateCharacters = ['.', '->', '::', '(', '[', '{'];

  constructor() {
    this.logger = new Logger('DebouncedCompletionManager');
    this.pendingRequests = new Map();
  }

  async getCompletions(
    context: CodeContext,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const requestId = context.hash || this.generateRequestId();

    // Cancel any pending request for this context
    this.cancelPendingRequest(requestId);

    // Calculate adaptive debounce delay
    const debounceDelay = this.calculateDebounceDelay(context);

    return new Promise((resolve, reject) => {
      // Clear existing timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // Check if we should trigger immediately
      if (this.shouldTriggerImmediately(context)) {
        this.executeCompletionRequest(context, requestId, cancellationToken)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Set up debounced execution
      this.debounceTimer = setTimeout(() => {
        this.executeCompletionRequest(context, requestId, cancellationToken)
          .then(resolve)
          .catch(reject);
      }, debounceDelay);

      // Handle cancellation
      cancellationToken.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.cancelPendingRequest(requestId);
        reject(new Error('Request cancelled'));
      });
    });
  }

  async getInlineCompletions(
    context: CodeContext,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    const requestId = context.hash || this.generateRequestId();

    // Cancel any pending request for this context
    this.cancelPendingRequest(requestId);

    // For inline completions, use a slightly longer debounce
    const debounceDelay = this.calculateDebounceDelay(context) * 1.5;

    return new Promise((resolve, reject) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.executeInlineCompletionRequest(context, requestId, cancellationToken)
          .then(resolve)
          .catch(reject);
      }, debounceDelay);

      cancellationToken.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.cancelPendingRequest(requestId);
        reject(new Error('Request cancelled'));
      });
    });
  }

  private async executeCompletionRequest(
    context: CodeContext,
    requestId: string,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const abortController = new AbortController();

    // Create pending request
    const pendingRequest: PendingRequest = {
      abortController,
      promise: this.fetchCompletions(context, abortController.signal),
      timestamp: Date.now(),
    };

    this.pendingRequests.set(requestId, pendingRequest);

    try {
      const completions = await pendingRequest.promise;
      this.pendingRequests.delete(requestId);
      return this.formatCompletions(completions, context);
    } catch (error) {
      this.pendingRequests.delete(requestId);
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.info('Completion request aborted');
        return [];
      }
      throw error;
    }
  }

  private async executeInlineCompletionRequest(
    context: CodeContext,
    requestId: string,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    const abortController = new AbortController();

    const pendingRequest: PendingRequest = {
      abortController,
      promise: this.fetchInlineCompletions(context, abortController.signal),
      timestamp: Date.now(),
    };

    this.pendingRequests.set(requestId, pendingRequest);

    try {
      const completions = await pendingRequest.promise;
      this.pendingRequests.delete(requestId);
      return this.formatInlineCompletions(completions, context);
    } catch (error) {
      this.pendingRequests.delete(requestId);
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.info('Inline completion request aborted');
        return [];
      }
      throw error;
    }
  }

  private async fetchCompletions(context: CodeContext, signal: AbortSignal): Promise<any[]> {
    // TODO: Implement actual API call to Claude
    // This is a placeholder that simulates an API call
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!signal.aborted) {
          const completions = [];

          // Check if we're in a block context
          if (this.isBlockContext(context)) {
            completions.push({
              text: 'if block',
              detail: 'Complete if statement',
              kind: vscode.CompletionItemKind.Snippet,
              isBlockCompletion: true,
              insertText: 'if (${1:condition}) {\n\t${2:// code}\n}',
            });
            completions.push({
              text: 'for loop',
              detail: 'Complete for loop',
              kind: vscode.CompletionItemKind.Snippet,
              isBlockCompletion: true,
              insertText:
                'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t${3:// code}\n}',
            });
            completions.push({
              text: 'try-catch',
              detail: 'Complete try-catch block',
              kind: vscode.CompletionItemKind.Snippet,
              isBlockCompletion: true,
              insertText:
                'try {\n\t${1:// code}\n} catch (${2:error}) {\n\t${3:// handle error}\n}',
            });
          }

          // Check for smart bracket completions
          const lastChar = context.currentLine.charAt(context.cursorPosition.character - 1);
          if (BracketMatcher.isOpenBracket(lastChar)) {
            const bracketCompletion = BracketMatcher.getSmartBracketCompletion(lastChar, {
              language: context.language,
              position: context.cursorPosition,
              document: context.document!,
              currentLine: context.currentLine,
            });

            if (bracketCompletion) {
              completions.unshift({
                text: lastChar + bracketCompletion,
                detail: 'Auto-close bracket',
                kind: vscode.CompletionItemKind.Text,
                insertText: bracketCompletion,
                isBlockCompletion: bracketCompletion.includes('\n'),
              });
            }
          }

          // Add regular completions
          completions.push(
            {
              text: 'console.log',
              detail: 'Log to console',
              kind: vscode.CompletionItemKind.Function,
            },
            {
              text: 'const',
              detail: 'Declare constant',
              kind: vscode.CompletionItemKind.Keyword,
            }
          );

          resolve(completions);
        }
      }, 150);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('AbortError'));
      });
    });
  }

  private async fetchInlineCompletions(context: CodeContext, signal: AbortSignal): Promise<any[]> {
    // TODO: Implement actual API call to Claude for inline completions
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!signal.aborted) {
          resolve([
            {
              text: '// TODO: Implement this function\\n' + context.indentation,
              range: new vscode.Range(context.cursorPosition, context.cursorPosition),
            },
          ]);
        }
      }, 200);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('AbortError'));
      });
    });
  }

  private formatCompletions(rawCompletions: any[], context: CodeContext): vscode.CompletionItem[] {
    return rawCompletions.map((completion, index) => {
      const item = new vscode.CompletionItem(
        completion.text,
        completion.kind || vscode.CompletionItemKind.Text
      );

      item.detail = completion.detail;
      item.documentation = completion.documentation;
      item.sortText = String(index).padStart(3, '0');

      // Handle nested block completions
      if (completion.isBlockCompletion) {
        item.insertText = new vscode.SnippetString(completion.insertText || completion.text);
      } else {
        item.insertText = completion.insertText || completion.text;
      }

      // Add command to track completion acceptance
      item.command = {
        command: 'continue-cc.trackCompletion',
        title: 'Track Completion',
        arguments: [completion.text],
      };

      return item;
    });
  }

  private formatInlineCompletions(
    rawCompletions: any[],
    context: CodeContext
  ): vscode.InlineCompletionItem[] {
    return rawCompletions.map((completion) => {
      return new vscode.InlineCompletionItem(completion.text, completion.range, {
        command: 'continue-cc.trackInlineCompletion',
        title: 'Track Inline Completion',
        arguments: [completion.text],
      });
    });
  }

  private calculateDebounceDelay(context: CodeContext): number {
    const currentTime = Date.now();

    if (this.lastTypeTime > 0) {
      const timeDiff = currentTime - this.lastTypeTime;
      // Update typing speed (chars per second approximation)
      this.typingSpeed = 1000 / timeDiff;
    }

    this.lastTypeTime = currentTime;

    // Adaptive delay based on typing speed
    if (this.typingSpeed > 5) {
      // Fast typing
      return this.maxDebounceDelay;
    } else if (this.typingSpeed > 2) {
      // Medium typing
      return (this.minDebounceDelay + this.maxDebounceDelay) / 2;
    } else {
      // Slow typing
      return this.minDebounceDelay;
    }
  }

  private shouldTriggerImmediately(context: CodeContext): boolean {
    const lastChar = context.currentLine.charAt(context.cursorPosition.character - 1);
    const lastTwoChars = context.currentLine.slice(
      Math.max(0, context.cursorPosition.character - 2),
      context.cursorPosition.character
    );

    return (
      this.immediateCharacters.includes(lastChar) || this.immediateCharacters.includes(lastTwoChars)
    );
  }

  private cancelPendingRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.abortController.abort();
      this.pendingRequests.delete(requestId);
      this.logger.info(`Cancelled pending request ${requestId}`);
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isBlockContext(context: CodeContext): boolean {
    // Check if the current line ends with an opening brace or common block starter
    const trimmedLine = context.currentLine.trim();
    const blockStarters = ['{', ':', 'then', 'do', 'begin'];

    // Check if line ends with block starter
    for (const starter of blockStarters) {
      if (trimmedLine.endsWith(starter)) {
        return true;
      }
    }

    // Check for incomplete block structures
    const incompletePatterns = [
      /^if\s*\(/,
      /^for\s*\(/,
      /^while\s*\(/,
      /^function\s+\w*\s*\(/,
      /^class\s+\w+/,
      /^try\s*$/,
      /^catch\s*\(/,
    ];

    return incompletePatterns.some((pattern) => pattern.test(trimmedLine));
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Cancel all pending requests
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      pending.abortController.abort();
    }
    this.pendingRequests.clear();
  }

  // Performance monitoring methods
  getMetrics(): {
    pendingRequests: number;
    averageTypingSpeed: number;
    lastDebounceDelay: number;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      averageTypingSpeed: this.typingSpeed,
      lastDebounceDelay: this.calculateDebounceDelay({} as CodeContext),
    };
  }
}
