import { CodeContext } from '../context/contextExtractor';
import * as vscode from 'vscode';

interface ContextDiff {
  hasChanged: boolean;
  changedFields: string[];
  prefixDiff?: LineDiff;
  suffixDiff?: LineDiff;
  importsDiff?: ArrayDiff;
  symbolsDiff?: ArrayDiff;
}

interface LineDiff {
  added: string[];
  removed: string[];
  unchanged: number;
}

interface ArrayDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export class ContextDiffCalculator {
  private static previousContext: CodeContext | null = null;

  static calculateDiff(newContext: CodeContext): ContextDiff {
    if (!this.previousContext) {
      this.previousContext = newContext;
      return {
        hasChanged: true,
        changedFields: ['initial'],
      };
    }

    const diff: ContextDiff = {
      hasChanged: false,
      changedFields: [],
    };

    // Check basic fields
    if (this.previousContext.language !== newContext.language) {
      diff.changedFields.push('language');
      diff.hasChanged = true;
    }

    if (
      this.previousContext.cursorPosition.line !== newContext.cursorPosition.line ||
      this.previousContext.cursorPosition.character !== newContext.cursorPosition.character
    ) {
      diff.changedFields.push('cursorPosition');
      diff.hasChanged = true;
    }

    // Calculate prefix diff
    if (this.previousContext.prefix !== newContext.prefix) {
      diff.prefixDiff = this.calculateLineDiff(this.previousContext.prefix, newContext.prefix);
      diff.changedFields.push('prefix');
      diff.hasChanged = true;
    }

    // Calculate suffix diff
    if (this.previousContext.suffix !== newContext.suffix) {
      diff.suffixDiff = this.calculateLineDiff(this.previousContext.suffix, newContext.suffix);
      diff.changedFields.push('suffix');
      diff.hasChanged = true;
    }

    // Calculate imports diff
    if (JSON.stringify(this.previousContext.imports) !== JSON.stringify(newContext.imports)) {
      diff.importsDiff = this.calculateArrayDiff(this.previousContext.imports, newContext.imports);
      diff.changedFields.push('imports');
      diff.hasChanged = true;
    }

    // Calculate symbols diff
    const prevSymbolNames = this.previousContext.symbols.map((s) => s.name);
    const newSymbolNames = newContext.symbols.map((s) => s.name);
    if (JSON.stringify(prevSymbolNames) !== JSON.stringify(newSymbolNames)) {
      diff.symbolsDiff = this.calculateArrayDiff(prevSymbolNames, newSymbolNames);
      diff.changedFields.push('symbols');
      diff.hasChanged = true;
    }

    // Store new context for next diff
    this.previousContext = newContext;

    return diff;
  }

  private static calculateLineDiff(oldText: string, newText: string): LineDiff {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    // Simple diff algorithm - find common prefix and suffix
    let commonPrefixLength = 0;
    const minLength = Math.min(oldLines.length, newLines.length);

    for (let i = 0; i < minLength; i++) {
      if (oldLines[i] === newLines[i]) {
        commonPrefixLength++;
      } else {
        break;
      }
    }

    let commonSuffixLength = 0;
    for (let i = 1; i <= minLength - commonPrefixLength; i++) {
      if (oldLines[oldLines.length - i] === newLines[newLines.length - i]) {
        commonSuffixLength++;
      } else {
        break;
      }
    }

    const removed = oldLines.slice(commonPrefixLength, oldLines.length - commonSuffixLength);
    const added = newLines.slice(commonPrefixLength, newLines.length - commonSuffixLength);

    return {
      added,
      removed,
      unchanged: commonPrefixLength + commonSuffixLength,
    };
  }

  private static calculateArrayDiff(oldArray: string[], newArray: string[]): ArrayDiff {
    const oldSet = new Set(oldArray);
    const newSet = new Set(newArray);

    const added = newArray.filter((item) => !oldSet.has(item));
    const removed = oldArray.filter((item) => !newSet.has(item));
    const unchanged = oldArray.filter((item) => newSet.has(item));

    return { added, removed, unchanged };
  }

  static applyDiffToContext(baseContext: CodeContext, diff: ContextDiff): Partial<CodeContext> {
    const updatedContext: Partial<CodeContext> = {};

    // Only update changed fields
    if (diff.changedFields.includes('prefix') && diff.prefixDiff) {
      // Apply prefix changes incrementally
      const lines = baseContext.prefix.split('\n');
      const unchangedPrefix = lines.slice(0, diff.prefixDiff.unchanged).join('\n');
      const newPrefix = unchangedPrefix + '\n' + diff.prefixDiff.added.join('\n');
      updatedContext.prefix = newPrefix;
    }

    if (diff.changedFields.includes('suffix') && diff.suffixDiff) {
      // Apply suffix changes incrementally
      const lines = baseContext.suffix.split('\n');
      const unchangedSuffix = lines.slice(-diff.suffixDiff.unchanged).join('\n');
      const newSuffix = diff.suffixDiff.added.join('\n') + '\n' + unchangedSuffix;
      updatedContext.suffix = newSuffix;
    }

    if (diff.changedFields.includes('imports') && diff.importsDiff) {
      // Merge imports
      updatedContext.imports = [...diff.importsDiff.unchanged, ...diff.importsDiff.added];
    }

    return updatedContext;
  }

  static reset(): void {
    this.previousContext = null;
  }

  static getIncrementalContext(newContext: CodeContext): CodeContext {
    const diff = this.calculateDiff(newContext);

    if (!diff.hasChanged) {
      // No changes, return minimal context
      return {
        ...newContext,
        prefix: newContext.currentLine,
        suffix: '',
      };
    }

    // For significant changes, return full context
    if (diff.changedFields.length > 3) {
      return newContext;
    }

    // For minor changes, return incremental update
    const incrementalContext = { ...newContext };

    // Reduce prefix/suffix to only changed parts
    if (diff.prefixDiff && diff.prefixDiff.added.length < 10) {
      incrementalContext.prefix = diff.prefixDiff.added.join('\n');
    }

    if (diff.suffixDiff && diff.suffixDiff.added.length < 10) {
      incrementalContext.suffix = diff.suffixDiff.added.join('\n');
    }

    return incrementalContext;
  }
}
