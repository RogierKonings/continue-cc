import * as vscode from 'vscode';
import type { ModeConfiguration } from './completionModes';
import { CompletionMode, MODE_CONFIGURATIONS } from './completionModes';

export class DocumentationCompletionProvider {
  private readonly config: ModeConfiguration;

  constructor() {
    this.config = MODE_CONFIGURATIONS[CompletionMode.DOCUMENTATION];
  }

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const languageId = document.languageId;
    const nextElement = this.findNextCodeElement(document, position);

    if (!nextElement) {
      return [];
    }

    const completions: vscode.CompletionItem[] = [];

    // Generate appropriate documentation based on language
    switch (languageId) {
      case 'javascript':
      case 'typescript':
      case 'javascriptreact':
      case 'typescriptreact':
        completions.push(...this.generateJSDocCompletions(nextElement));
        break;
      case 'python':
        completions.push(...this.generatePythonDocstringCompletions(nextElement));
        break;
      case 'java':
      case 'csharp':
        completions.push(...this.generateJavadocCompletions(nextElement));
        break;
      default:
        completions.push(...this.generateGenericDocCompletions(nextElement, languageId));
    }

    return completions;
  }

  private findNextCodeElement(
    document: vscode.TextDocument,
    position: vscode.Position
  ): CodeElement | null {
    // Look ahead for the next code element to document
    let lineNum = position.line + 1;
    const maxLines = Math.min(lineNum + 10, document.lineCount);

    while (lineNum < maxLines) {
      const line = document.lineAt(lineNum).text;
      const element = this.parseCodeElement(line, document.languageId);

      if (element) {
        element.line = lineNum;
        return element;
      }

      lineNum++;
    }

    return null;
  }

  private parseCodeElement(line: string, languageId: string): CodeElement | null {
    // Function/method patterns
    const functionPatterns = [
      /^\s*(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      /^\s*(public|private|protected)?\s*(static\s+)?(\w+)\s*\(([^)]*)\)/,
      /^\s*(\w+)\s*:\s*(async\s+)?\(([^)]*)\)\s*=>/,
      /^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(?:function|\()/,
    ];

    for (const pattern of functionPatterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          type: 'function',
          name: match[3] || match[2] || match[1],
          parameters: this.parseParameters(match[4] || match[3] || ''),
          isAsync: line.includes('async'),
          line: 0,
        };
      }
    }

    // Class patterns
    const classPattern = /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const classMatch = line.match(classPattern);
    if (classMatch) {
      return {
        type: 'class',
        name: classMatch[3],
        parameters: [],
        isAsync: false,
        line: 0,
      };
    }

    // Interface/type patterns
    const interfacePattern = /^\s*(export\s+)?(?:interface|type)\s+(\w+)/;
    const interfaceMatch = line.match(interfacePattern);
    if (interfaceMatch) {
      return {
        type: 'interface',
        name: interfaceMatch[2],
        parameters: [],
        isAsync: false,
        line: 0,
      };
    }

    return null;
  }

  private parseParameters(paramsStr: string): string[] {
    if (!paramsStr.trim()) {
      return [];
    }

    return paramsStr
      .split(',')
      .map((param) => {
        const name = param.trim().split(/[:\s=]/)[0];
        return name;
      })
      .filter((name) => name);
  }

  private generateJSDocCompletions(element: CodeElement): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Full JSDoc template
    const fullJSDoc = new vscode.CompletionItem(
      'JSDoc - Full documentation',
      vscode.CompletionItemKind.Snippet
    );
    let jsdocContent = '/**\n';
    jsdocContent += ' * ${1:Brief description}\n';
    jsdocContent += ' *\n';

    // Add parameter documentation
    element.parameters.forEach((param, index) => {
      jsdocContent += ` * @param {${index + 2}} ${param} - \${${index + 3}:Description}\n`;
    });

    // Add return documentation for functions
    if (element.type === 'function') {
      const returnIndex = element.parameters.length * 2 + 2;
      jsdocContent += ` * @returns {\${${returnIndex}:type}} \${${returnIndex + 1}:Description}\n`;
    }

    // Add async throws documentation
    if (element.isAsync) {
      const throwsIndex = element.parameters.length * 2 + 4;
      jsdocContent += ` * @throws {\${${throwsIndex}:Error}} \${${throwsIndex + 1}:When...}\n`;
    }

    // Add example
    const exampleIndex = element.parameters.length * 2 + 6;
    jsdocContent += ' * @example\n';
    jsdocContent += ` * \${${exampleIndex}:// Example usage}\n`;
    jsdocContent += ' */';

    fullJSDoc.insertText = new vscode.SnippetString(jsdocContent);
    fullJSDoc.detail = 'Generate complete JSDoc documentation';
    completions.push(fullJSDoc);

    // Simple JSDoc template
    const simpleJSDoc = new vscode.CompletionItem(
      'JSDoc - Simple',
      vscode.CompletionItemKind.Snippet
    );
    simpleJSDoc.insertText = new vscode.SnippetString('/**\n * ${1:Description}\n */');
    simpleJSDoc.detail = 'Generate simple JSDoc comment';
    completions.push(simpleJSDoc);

    return completions;
  }

  private generatePythonDocstringCompletions(element: CodeElement): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Google style docstring
    const googleDocstring = new vscode.CompletionItem(
      'Docstring - Google style',
      vscode.CompletionItemKind.Snippet
    );
    let docContent = '"""${1:Brief description}.\n\n';

    if (element.parameters.length > 0) {
      docContent += 'Args:\n';
      element.parameters.forEach((param, index) => {
        docContent += `    ${param}: \${${index + 2}:Description}\n`;
      });
      docContent += '\n';
    }

    if (element.type === 'function') {
      const returnIndex = element.parameters.length + 2;
      docContent += `Returns:\n    \${${returnIndex}:Description}\n\n`;
    }

    if (element.isAsync || element.type === 'function') {
      const raisesIndex = element.parameters.length + 3;
      docContent += `Raises:\n    \${${raisesIndex}:ExceptionType}: \${${raisesIndex + 1}:When...}\n\n`;
    }

    const exampleIndex = element.parameters.length + 5;
    docContent += `Example:\n    \${${exampleIndex}:>>> example_usage()}\n`;
    docContent += '"""';

    googleDocstring.insertText = new vscode.SnippetString(docContent);
    googleDocstring.detail = 'Generate Google-style Python docstring';
    completions.push(googleDocstring);

    // NumPy style docstring
    const numpyDocstring = new vscode.CompletionItem(
      'Docstring - NumPy style',
      vscode.CompletionItemKind.Snippet
    );
    let numpyContent = '"""\n${1:Brief description}.\n\n';

    if (element.parameters.length > 0) {
      numpyContent += 'Parameters\n----------\n';
      element.parameters.forEach((param, index) => {
        numpyContent += `${param} : \${${index + 2}:type}\n    \${${index + 3}:Description}\n`;
      });
      numpyContent += '\n';
    }

    if (element.type === 'function') {
      const returnIndex = element.parameters.length * 2 + 2;
      numpyContent += `Returns\n-------\n\${${returnIndex}:type}\n    \${${returnIndex + 1}:Description}\n\n`;
    }

    numpyContent += '"""';

    numpyDocstring.insertText = new vscode.SnippetString(numpyContent);
    numpyDocstring.detail = 'Generate NumPy-style Python docstring';
    completions.push(numpyDocstring);

    return completions;
  }

  private generateJavadocCompletions(element: CodeElement): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    const javadoc = new vscode.CompletionItem('Javadoc', vscode.CompletionItemKind.Snippet);
    let docContent = '/**\n';
    docContent += ' * ${1:Brief description}.\n';
    docContent += ' *\n';

    element.parameters.forEach((param, index) => {
      docContent += ` * @param ${param} \${${index + 2}:Description}\n`;
    });

    if (element.type === 'function') {
      const returnIndex = element.parameters.length + 2;
      docContent += ` * @return \${${returnIndex}:Description}\n`;
    }

    const throwsIndex = element.parameters.length + 3;
    docContent += ` * @throws \${${throwsIndex}:Exception} \${${throwsIndex + 1}:When...}\n`;
    docContent += ' */';

    javadoc.insertText = new vscode.SnippetString(docContent);
    javadoc.detail = 'Generate Javadoc documentation';
    completions.push(javadoc);

    return completions;
  }

  private generateGenericDocCompletions(
    element: CodeElement,
    languageId: string
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Generic block comment
    const blockComment = new vscode.CompletionItem(
      'Block comment',
      vscode.CompletionItemKind.Snippet
    );
    const commentStyle = this.getCommentStyle(languageId);

    let content = `${commentStyle.block.start}\n`;
    content += `${commentStyle.block.line} \${1:Description}\n`;

    if (element.parameters.length > 0) {
      content += `${commentStyle.block.line}\n`;
      content += `${commentStyle.block.line} Parameters:\n`;
      element.parameters.forEach((param, index) => {
        content += `${commentStyle.block.line}   ${param} - \${${index + 2}:Description}\n`;
      });
    }

    content += commentStyle.block.end;

    blockComment.insertText = new vscode.SnippetString(content);
    blockComment.detail = 'Generate block comment documentation';
    completions.push(blockComment);

    // Inline comment
    const inlineComment = new vscode.CompletionItem(
      'Inline comment',
      vscode.CompletionItemKind.Snippet
    );
    inlineComment.insertText = new vscode.SnippetString(`${commentStyle.inline} \${1:Description}`);
    inlineComment.detail = 'Generate inline comment';
    completions.push(inlineComment);

    return completions;
  }

  private getCommentStyle(languageId: string): CommentStyle {
    const styles: Record<string, CommentStyle> = {
      javascript: { inline: '//', block: { start: '/**', line: ' *', end: ' */' } },
      typescript: { inline: '//', block: { start: '/**', line: ' *', end: ' */' } },
      python: { inline: '#', block: { start: '"""', line: '', end: '"""' } },
      ruby: { inline: '#', block: { start: '=begin', line: '', end: '=end' } },
      go: { inline: '//', block: { start: '/*', line: ' *', end: ' */' } },
      rust: { inline: '//', block: { start: '///', line: '///', end: '' } },
      java: { inline: '//', block: { start: '/**', line: ' *', end: ' */' } },
      c: { inline: '//', block: { start: '/*', line: ' *', end: ' */' } },
      cpp: { inline: '//', block: { start: '/**', line: ' *', end: ' */' } },
      csharp: { inline: '//', block: { start: '///', line: '///', end: '' } },
    };

    return (
      styles[languageId] || {
        inline: '//',
        block: { start: '/*', line: ' *', end: ' */' },
      }
    );
  }

  getConfiguration(): ModeConfiguration {
    return this.config;
  }
}

interface CodeElement {
  type: 'function' | 'class' | 'interface';
  name: string;
  parameters: string[];
  isAsync: boolean;
  line: number;
}

interface CommentStyle {
  inline: string;
  block: {
    start: string;
    line: string;
    end: string;
  };
}
