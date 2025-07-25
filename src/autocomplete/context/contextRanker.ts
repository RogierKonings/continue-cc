import * as vscode from 'vscode';
import { SymbolInfo } from './symbolIndexer';
import { Logger } from '../../utils/logger';

export interface ContextScore {
  symbol: SymbolInfo;
  relevance: number; // 0-1
  recency: number; // 0-1
  frequency: number; // 0-1
  distance: number; // 0-1
  total: number; // weighted sum
}

export interface RankingWeights {
  relevance: number;
  recency: number;
  frequency: number;
  distance: number;
}

export class ContextRanker {
  private readonly logger: Logger;
  private readonly defaultWeights: RankingWeights = {
    relevance: 0.4,
    recency: 0.2,
    frequency: 0.2,
    distance: 0.2,
  };

  constructor() {
    this.logger = new Logger('ContextRanker');
  }

  /**
   * Rank symbols by relevance to current context
   */
  rankSymbols(
    symbols: SymbolInfo[],
    currentPosition: vscode.Position,
    currentFile: vscode.Uri,
    query?: string,
    weights: RankingWeights = this.defaultWeights
  ): ContextScore[] {
    const scores: ContextScore[] = [];

    for (const symbol of symbols) {
      const relevance = this.calculateRelevance(symbol, query);
      const recency = this.calculateRecency(symbol);
      const frequency = this.calculateFrequency(symbol);
      const distance = this.calculateDistance(symbol, currentPosition, currentFile);

      const total =
        weights.relevance * relevance +
        weights.recency * recency +
        weights.frequency * frequency +
        weights.distance * distance;

      scores.push({
        symbol,
        relevance,
        recency,
        frequency,
        distance,
        total,
      });
    }

    // Sort by total score descending
    return scores.sort((a, b) => b.total - a.total);
  }

  /**
   * Calculate relevance score based on query match
   */
  private calculateRelevance(symbol: SymbolInfo, query?: string): number {
    if (!query) {
      return 0.5; // Neutral score if no query
    }

    const name = symbol.name.toLowerCase();
    const q = query.toLowerCase();

    // Exact match
    if (name === q) {
      return 1.0;
    }

    // Starts with query
    if (name.startsWith(q)) {
      return 0.9;
    }

    // Contains query
    if (name.includes(q)) {
      return 0.7;
    }

    // Fuzzy match
    const fuzzyScore = this.fuzzyMatch(name, q);
    if (fuzzyScore > 0) {
      return fuzzyScore * 0.6;
    }

    return 0;
  }

  /**
   * Calculate recency score based on last access time
   */
  private calculateRecency(symbol: SymbolInfo): number {
    if (!symbol.lastAccessed) {
      return 0;
    }

    const now = Date.now();
    const lastAccessed = symbol.lastAccessed.getTime();
    const ageInMs = now - lastAccessed;

    // Convert to hours
    const ageInHours = ageInMs / (1000 * 60 * 60);

    // Decay function: score decreases as age increases
    if (ageInHours < 1) {
      return 1.0; // Used within last hour
    } else if (ageInHours < 24) {
      return 0.8; // Used today
    } else if (ageInHours < 24 * 7) {
      return 0.5; // Used this week
    } else if (ageInHours < 24 * 30) {
      return 0.3; // Used this month
    } else {
      return 0.1; // Older than a month
    }
  }

  /**
   * Calculate frequency score based on usage count
   */
  private calculateFrequency(symbol: SymbolInfo): number {
    const count = symbol.usageCount || 0;

    // Logarithmic scale to prevent very high counts from dominating
    if (count === 0) {
      return 0;
    } else if (count < 5) {
      return 0.3;
    } else if (count < 10) {
      return 0.5;
    } else if (count < 50) {
      return 0.7;
    } else if (count < 100) {
      return 0.9;
    } else {
      return 1.0;
    }
  }

  /**
   * Calculate distance score based on file and position distance
   */
  private calculateDistance(
    symbol: SymbolInfo,
    currentPosition: vscode.Position,
    currentFile: vscode.Uri
  ): number {
    // Same file
    if (symbol.location.uri.toString() === currentFile.toString()) {
      // Calculate line distance
      const lineDistance = Math.abs(symbol.location.range.start.line - currentPosition.line);

      if (lineDistance === 0) {
        return 1.0; // Same line
      } else if (lineDistance < 10) {
        return 0.9; // Very close
      } else if (lineDistance < 50) {
        return 0.7; // Same screen/function
      } else if (lineDistance < 200) {
        return 0.5; // Same file region
      } else {
        return 0.3; // Far in same file
      }
    }

    // Different file - check if in same directory
    const symbolDir = vscode.Uri.file(symbol.location.uri.fsPath).path;
    const currentDir = vscode.Uri.file(currentFile.fsPath).path;

    if (this.getDirectory(symbolDir) === this.getDirectory(currentDir)) {
      return 0.6; // Same directory
    }

    // Check if in parent/child directory
    if (symbolDir.includes(currentDir) || currentDir.includes(symbolDir)) {
      return 0.4; // Related directory
    }

    // Unrelated file
    return 0.1;
  }

  /**
   * Simple fuzzy matching algorithm
   */
  private fuzzyMatch(str: string, pattern: string): number {
    let patternIdx = 0;
    let score = 0;
    let consecutive = 0;

    for (let i = 0; i < str.length; i++) {
      if (patternIdx < pattern.length && str[i] === pattern[patternIdx]) {
        score += 1 + consecutive * 0.5; // Bonus for consecutive matches
        consecutive++;
        patternIdx++;
      } else {
        consecutive = 0;
      }
    }

    // All pattern characters found
    if (patternIdx === pattern.length) {
      return score / pattern.length;
    }

    return 0;
  }

  /**
   * Get directory from path
   */
  private getDirectory(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/');
  }

  /**
   * Filter symbols by minimum score threshold
   */
  filterByScore(scores: ContextScore[], threshold: number = 0.3): ContextScore[] {
    return scores.filter((score) => score.total >= threshold);
  }

  /**
   * Get top N symbols
   */
  getTopSymbols(scores: ContextScore[], limit: number = 10): SymbolInfo[] {
    return scores.slice(0, limit).map((score) => score.symbol);
  }

  /**
   * Adjust weights based on context type
   */
  getContextualWeights(contextType: 'navigation' | 'completion' | 'definition'): RankingWeights {
    switch (contextType) {
      case 'navigation':
        // For navigation, relevance and recency are most important
        return {
          relevance: 0.5,
          recency: 0.3,
          frequency: 0.1,
          distance: 0.1,
        };

      case 'completion':
        // For completion, distance and frequency matter more
        return {
          relevance: 0.3,
          recency: 0.1,
          frequency: 0.3,
          distance: 0.3,
        };

      case 'definition':
        // For go-to-definition, relevance is key
        return {
          relevance: 0.7,
          recency: 0.1,
          frequency: 0.1,
          distance: 0.1,
        };

      default:
        return this.defaultWeights;
    }
  }

  /**
   * Create a context-aware prompt with ranked symbols
   */
  buildContextPrompt(rankedSymbols: ContextScore[], maxTokens: number = 2000): string {
    let prompt = '// Relevant context from the project:\n\n';
    let tokenCount = 0;
    const tokenLimit = maxTokens * 0.8; // Leave some room

    for (const score of rankedSymbols) {
      const symbol = score.symbol;
      const symbolText = this.formatSymbol(symbol);
      const symbolTokens = this.estimateTokens(symbolText);

      if (tokenCount + symbolTokens > tokenLimit) {
        break;
      }

      prompt += symbolText + '\n\n';
      tokenCount += symbolTokens;
    }

    return prompt;
  }

  /**
   * Format symbol for inclusion in prompt
   */
  private formatSymbol(symbol: SymbolInfo): string {
    let result = `// ${this.getSymbolKindName(symbol.kind)}: ${symbol.name}`;

    if (symbol.containerName) {
      result += ` (in ${symbol.containerName})`;
    }

    if (symbol.detail) {
      result += `\n// ${symbol.detail}`;
    }

    if (symbol.signature) {
      result += `\n${symbol.signature}`;
    }

    return result;
  }

  /**
   * Get human-readable symbol kind name
   */
  private getSymbolKindName(kind: vscode.SymbolKind): string {
    const kindNames: Record<number, string> = {
      [vscode.SymbolKind.File]: 'File',
      [vscode.SymbolKind.Module]: 'Module',
      [vscode.SymbolKind.Namespace]: 'Namespace',
      [vscode.SymbolKind.Package]: 'Package',
      [vscode.SymbolKind.Class]: 'Class',
      [vscode.SymbolKind.Method]: 'Method',
      [vscode.SymbolKind.Property]: 'Property',
      [vscode.SymbolKind.Field]: 'Field',
      [vscode.SymbolKind.Constructor]: 'Constructor',
      [vscode.SymbolKind.Enum]: 'Enum',
      [vscode.SymbolKind.Interface]: 'Interface',
      [vscode.SymbolKind.Function]: 'Function',
      [vscode.SymbolKind.Variable]: 'Variable',
      [vscode.SymbolKind.Constant]: 'Constant',
      [vscode.SymbolKind.String]: 'String',
      [vscode.SymbolKind.Number]: 'Number',
      [vscode.SymbolKind.Boolean]: 'Boolean',
      [vscode.SymbolKind.Array]: 'Array',
      [vscode.SymbolKind.Object]: 'Object',
      [vscode.SymbolKind.Key]: 'Key',
      [vscode.SymbolKind.Null]: 'Null',
      [vscode.SymbolKind.EnumMember]: 'Enum Member',
      [vscode.SymbolKind.Struct]: 'Struct',
      [vscode.SymbolKind.Event]: 'Event',
      [vscode.SymbolKind.Operator]: 'Operator',
      [vscode.SymbolKind.TypeParameter]: 'Type Parameter',
    };

    return kindNames[kind] || 'Unknown';
  }

  /**
   * Estimate token count for a string
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }
}
