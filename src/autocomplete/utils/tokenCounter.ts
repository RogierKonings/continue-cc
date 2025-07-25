import type { CodeContext } from '../context/contextExtractor';

export class TokenCounter {
  // Approximate token counting - roughly 4 characters per token
  private static readonly CHARS_PER_TOKEN = 4;

  // Model-specific token limits
  private static readonly TOKEN_LIMITS: Record<string, number> = {
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-2.1': 100000,
    'claude-2': 100000,
    'claude-instant': 100000,
    default: 100000,
  };

  // Context size limits (leaving room for completion)
  private static readonly CONTEXT_RATIO = 0.8; // Use 80% of limit for context

  static countTokens(text: string): number {
    // Simple approximation: split by whitespace and punctuation
    // More accurate would be to use a proper tokenizer
    const words = text.match(/\b\w+\b/g) || [];
    const punctuation = text.match(/[^\w\s]/g) || [];

    // Estimate tokens as words + punctuation
    return words.length + punctuation.length;
  }

  static countContextTokens(context: CodeContext): {
    total: number;
    breakdown: {
      prefix: number;
      suffix: number;
      imports: number;
      symbols: number;
      readme: number;
      projectInfo: number;
      typeDefinitions: number;
    };
  } {
    const breakdown = {
      prefix: this.countTokens(context.prefix),
      suffix: this.countTokens(context.suffix),
      imports: this.countTokens(context.imports.join('\n')),
      symbols: this.countTokens(context.symbols.map((s) => `${s.name}: ${s.kind}`).join('\n')),
      readme: context.readmeContent ? this.countTokens(context.readmeContent) : 0,
      projectInfo: this.countTokens(JSON.stringify(context.projectInfo || {})),
      typeDefinitions: context.typeDefinitions
        ? this.countTokens(context.typeDefinitions.map((t) => t.definition).join('\n'))
        : 0,
    };

    const total = Object.values(breakdown).reduce((sum, count) => sum + count, 0);

    return { total, breakdown };
  }

  static getTokenLimit(model: string): number {
    return this.TOKEN_LIMITS[model] || this.TOKEN_LIMITS.default;
  }

  static getContextLimit(model: string): number {
    return Math.floor(this.getTokenLimit(model) * this.CONTEXT_RATIO);
  }

  static truncateContext(context: CodeContext, model: string): CodeContext {
    const limit = this.getContextLimit(model);
    const { total, breakdown } = this.countContextTokens(context);

    if (total <= limit) {
      return context;
    }

    // Create a copy to avoid mutating the original
    const truncatedContext = { ...context };

    // Priority order for truncation
    // 1. Truncate suffix first (less important)
    // 2. Then README content
    // 3. Then project info
    // 4. Then symbols (keep most relevant)
    // 5. Finally prefix (most important for immediate context)

    const tokensToRemove = total - limit;
    let removed = 0;

    // Truncate suffix
    if (removed < tokensToRemove && breakdown.suffix > 0) {
      const suffixRatio = Math.max(0, 1 - (tokensToRemove - removed) / breakdown.suffix);
      const newSuffixLength = Math.floor(context.suffix.length * suffixRatio);
      truncatedContext.suffix = context.suffix.substring(0, newSuffixLength) + '...';
      removed += breakdown.suffix - this.countTokens(truncatedContext.suffix);
    }

    // Remove README if needed
    if (removed < tokensToRemove && breakdown.readme > 0) {
      truncatedContext.readmeContent = undefined;
      removed += breakdown.readme;
    }

    // Reduce project info
    if (removed < tokensToRemove && breakdown.projectInfo > 0) {
      truncatedContext.projectInfo = {
        projectType: context.projectInfo?.projectType,
        frameworks: context.projectInfo?.frameworks?.slice(0, 3),
      };
      removed +=
        breakdown.projectInfo - this.countTokens(JSON.stringify(truncatedContext.projectInfo));
    }

    // Reduce symbols (keep only most relevant)
    if (removed < tokensToRemove && breakdown.symbols > 0) {
      const symbolsToKeep = Math.max(10, Math.floor(context.symbols.length * 0.3));
      truncatedContext.symbols = context.symbols
        .filter((s) => s.range.contains(context.cursorPosition))
        .slice(0, symbolsToKeep);
      removed +=
        breakdown.symbols -
        this.countTokens(truncatedContext.symbols.map((s) => `${s.name}: ${s.kind}`).join('\n'));
    }

    // If still over limit, truncate prefix (keep most recent part)
    if (removed < tokensToRemove && breakdown.prefix > 0) {
      const prefixRatio = Math.max(0.3, 1 - (tokensToRemove - removed) / breakdown.prefix);
      const newPrefixStart = Math.floor(context.prefix.length * (1 - prefixRatio));
      truncatedContext.prefix = '...' + context.prefix.substring(newPrefixStart);
    }

    return truncatedContext;
  }

  static formatTokenInfo(context: CodeContext, model: string): string {
    const { total, breakdown } = this.countContextTokens(context);
    const limit = this.getContextLimit(model);
    const percentage = ((total / limit) * 100).toFixed(1);

    return `Token usage: ${total}/${limit} (${percentage}%)
Breakdown:
  - Prefix: ${breakdown.prefix}
  - Suffix: ${breakdown.suffix}
  - Imports: ${breakdown.imports}
  - Symbols: ${breakdown.symbols}
  - README: ${breakdown.readme}
  - Project: ${breakdown.projectInfo}
  - Types: ${breakdown.typeDefinitions}`;
  }
}
