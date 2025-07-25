import { CompletionMode } from '../modes/completionModes';

export interface LanguagePromptConfig {
  language: string;
  mode: CompletionMode;
  template: string;
  systemPrompt?: string;
  includeImports?: boolean;
  includeTypes?: boolean;
  syntaxHints?: string[];
  idioms?: string[];
}

export class LanguagePromptTemplate {
  private static readonly TEMPLATES: Map<string, Map<CompletionMode, LanguagePromptConfig>> =
    new Map<string, Map<CompletionMode, LanguagePromptConfig>>([
      // JavaScript templates
      [
        'javascript',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'javascript',
              mode: CompletionMode.LINE,
              template: 'Complete the following JavaScript line:',
              syntaxHints: ['Use ES6+ syntax', 'Prefer const/let over var'],
              idioms: [
                'Use arrow functions for callbacks',
                'Use template literals for string interpolation',
              ],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'javascript',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following JavaScript function based on its signature:',
              includeTypes: false,
              syntaxHints: ['Use modern JavaScript features', 'Handle edge cases'],
              idioms: ['Return early for guard clauses', 'Use destructuring when appropriate'],
            },
          ],
          [
            CompletionMode.DOCUMENTATION,
            {
              language: 'javascript',
              mode: CompletionMode.DOCUMENTATION,
              template: 'Generate JSDoc documentation for the following JavaScript code:',
              syntaxHints: ['Use @param, @returns, @throws tags', 'Include @example when helpful'],
            },
          ],
        ]),
      ],

      // TypeScript templates
      [
        'typescript',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'typescript',
              mode: CompletionMode.LINE,
              template: 'Complete the following TypeScript line with proper types:',
              includeTypes: true,
              syntaxHints: [
                'Include type annotations',
                'Use interfaces over type aliases for objects',
              ],
              idioms: ['Prefer const assertions', 'Use readonly when appropriate'],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'typescript',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following TypeScript function with full type safety:',
              includeTypes: true,
              syntaxHints: [
                'Respect the function signature types',
                'Use generics when appropriate',
              ],
              idioms: ['Avoid using any', 'Use type guards for runtime checks'],
            },
          ],
          [
            CompletionMode.BLOCK,
            {
              language: 'typescript',
              mode: CompletionMode.BLOCK,
              template: 'Complete the following TypeScript code block:',
              includeTypes: true,
              syntaxHints: ['Maintain type safety', 'Use proper error handling'],
            },
          ],
        ]),
      ],

      // Python templates
      [
        'python',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'python',
              mode: CompletionMode.LINE,
              template: 'Complete the following Python line:',
              syntaxHints: ['Follow PEP 8 style guide', 'Use snake_case for variables'],
              idioms: [
                'Use list comprehensions when appropriate',
                'Prefer f-strings for formatting',
              ],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'python',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following Python function:',
              includeTypes: true,
              syntaxHints: ['Include type hints', 'Follow Python idioms'],
              idioms: ['Use early returns', 'Handle None values appropriately'],
            },
          ],
          [
            CompletionMode.DOCUMENTATION,
            {
              language: 'python',
              mode: CompletionMode.DOCUMENTATION,
              template: 'Generate a Python docstring (Google style) for the following:',
              syntaxHints: ['Use Args, Returns, Raises sections', 'Include type information'],
            },
          ],
        ]),
      ],

      // Java templates
      [
        'java',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'java',
              mode: CompletionMode.LINE,
              template: 'Complete the following Java line:',
              syntaxHints: ['Use appropriate access modifiers', 'Follow Java naming conventions'],
              idioms: ['Use final for immutability', 'Prefer interfaces to concrete types'],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'java',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following Java method:',
              includeTypes: true,
              syntaxHints: ['Handle checked exceptions', 'Follow SOLID principles'],
              idioms: ['Use Optional for nullable returns', 'Validate inputs'],
            },
          ],
          [
            CompletionMode.DOCUMENTATION,
            {
              language: 'java',
              mode: CompletionMode.DOCUMENTATION,
              template: 'Generate Javadoc for the following Java code:',
              syntaxHints: ['Use @param, @return, @throws tags', 'Include @since if applicable'],
            },
          ],
        ]),
      ],

      // Go templates
      [
        'go',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'go',
              mode: CompletionMode.LINE,
              template: 'Complete the following Go line:',
              syntaxHints: ['Use short variable declarations', 'Handle errors explicitly'],
              idioms: ['Return error as last value', 'Use defer for cleanup'],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'go',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following Go function:',
              syntaxHints: ['Follow Go conventions', 'Return errors appropriately'],
              idioms: ['Check errors immediately', 'Use named return values sparingly'],
            },
          ],
        ]),
      ],

      // Rust templates
      [
        'rust',
        new Map([
          [
            CompletionMode.LINE,
            {
              language: 'rust',
              mode: CompletionMode.LINE,
              template: 'Complete the following Rust line:',
              syntaxHints: ['Follow ownership rules', 'Use pattern matching'],
              idioms: ['Use Result and Option types', 'Prefer match over unwrap'],
            },
          ],
          [
            CompletionMode.FUNCTION,
            {
              language: 'rust',
              mode: CompletionMode.FUNCTION,
              template: 'Implement the following Rust function:',
              syntaxHints: ['Respect borrowing rules', 'Use appropriate lifetimes'],
              idioms: [
                'Return Result for fallible operations',
                'Use ? operator for error propagation',
              ],
            },
          ],
        ]),
      ],
    ]);

  /**
   * Get prompt template for a specific language and mode
   */
  static getTemplate(language: string, mode: CompletionMode): LanguagePromptConfig | null {
    const languageTemplates = this.TEMPLATES.get(language);
    if (!languageTemplates) {
      return this.getDefaultTemplate(language, mode);
    }

    return languageTemplates.get(mode) || this.getDefaultTemplate(language, mode);
  }

  /**
   * Get default template for unsupported language/mode combinations
   */
  private static getDefaultTemplate(language: string, mode: CompletionMode): LanguagePromptConfig {
    const modeTemplates: Record<CompletionMode, string> = {
      [CompletionMode.LINE]: `Complete the following ${language} line:`,
      [CompletionMode.BLOCK]: `Complete the following ${language} code block:`,
      [CompletionMode.FUNCTION]: `Implement the following ${language} function:`,
      [CompletionMode.DOCUMENTATION]: `Generate documentation for the following ${language} code:`,
      [CompletionMode.AUTO]: `Complete the following ${language} code:`,
    };

    return {
      language,
      mode,
      template: modeTemplates[mode] || `Complete the following ${language} code:`,
      syntaxHints: ['Follow language best practices', 'Write idiomatic code'],
    };
  }

  /**
   * Build a complete prompt from template and context
   */
  static buildPrompt(
    config: LanguagePromptConfig,
    context: {
      prefix: string;
      suffix: string;
      imports?: string[];
      types?: string[];
      relatedCode?: string[];
    }
  ): string {
    let prompt = config.template + '\n\n';

    // Add imports if requested
    if (config.includeImports && context.imports && context.imports.length > 0) {
      prompt += 'Available imports:\n';
      context.imports.forEach((imp) => {
        prompt += `${imp}\n`;
      });
      prompt += '\n';
    }

    // Add type information if requested
    if (config.includeTypes && context.types && context.types.length > 0) {
      prompt += 'Type definitions:\n';
      context.types.forEach((type) => {
        prompt += `${type}\n`;
      });
      prompt += '\n';
    }

    // Add syntax hints
    if (config.syntaxHints && config.syntaxHints.length > 0) {
      prompt += 'Guidelines:\n';
      config.syntaxHints.forEach((hint) => {
        prompt += `- ${hint}\n`;
      });
      prompt += '\n';
    }

    // Add idioms
    if (config.idioms && config.idioms.length > 0) {
      prompt += 'Best practices:\n';
      config.idioms.forEach((idiom) => {
        prompt += `- ${idiom}\n`;
      });
      prompt += '\n';
    }

    // Add the actual code context
    prompt += 'Code to complete:\n```' + config.language + '\n';
    prompt += context.prefix;
    prompt += '<CURSOR>';
    prompt += context.suffix;
    prompt += '\n```\n';

    // Add related code if available
    if (context.relatedCode && context.relatedCode.length > 0) {
      prompt += '\nRelated code from the project:\n';
      context.relatedCode.forEach((code, index) => {
        prompt += `\n// Context ${index + 1}:\n${code}\n`;
      });
    }

    return prompt;
  }

  /**
   * Get all supported language/mode combinations
   */
  static getSupportedCombinations(): Array<{ language: string; mode: CompletionMode }> {
    const combinations: Array<{ language: string; mode: CompletionMode }> = [];

    this.TEMPLATES.forEach((modes, language) => {
      modes.forEach((_, mode) => {
        combinations.push({ language, mode });
      });
    });

    return combinations;
  }

  /**
   * Check if a language/mode combination is supported
   */
  static isSupported(language: string, mode: CompletionMode): boolean {
    const languageTemplates = this.TEMPLATES.get(language);
    return languageTemplates ? languageTemplates.has(mode) : false;
  }
}
