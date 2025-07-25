import * as vscode from 'vscode';
import type { ModeConfiguration } from './completionModes';
import { CompletionMode, MODE_CONFIGURATIONS } from './completionModes';

export class FunctionCompletionProvider {
  private readonly config: ModeConfiguration;

  constructor() {
    this.config = MODE_CONFIGURATIONS[CompletionMode.FUNCTION];
  }

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const functionSignature = this.extractFunctionSignature(document, position);
    if (!functionSignature) {
      return [];
    }

    const completions: vscode.CompletionItem[] = [];

    // Generate function body based on signature
    const bodyCompletion = this.generateFunctionBody(functionSignature, document.languageId);
    if (bodyCompletion) {
      completions.push(bodyCompletion);
    }

    // Add async function pattern if applicable
    if (functionSignature.isAsync) {
      completions.push(...this.getAsyncPatterns(functionSignature));
    }

    // Add return statement templates
    if (functionSignature.returnType) {
      completions.push(...this.getReturnPatterns(functionSignature));
    }

    return completions;
  }

  private extractFunctionSignature(
    document: vscode.TextDocument,
    position: vscode.Position
  ): FunctionSignature | null {
    // Look for function declaration in previous lines
    let lineNum = position.line;
    let functionLine = '';

    // Check current and previous lines for function signature
    while (lineNum >= 0 && lineNum > position.line - 3) {
      const line = document.lineAt(lineNum).text;
      if (this.isFunctionDeclaration(line)) {
        functionLine = line;
        break;
      }
      lineNum--;
    }

    if (!functionLine) {
      return null;
    }

    return this.parseFunctionSignature(functionLine, document.languageId);
  }

  private isFunctionDeclaration(line: string): boolean {
    const patterns = [
      /^\s*(async\s+)?function\s+\w+\s*\(/,
      /^\s*(public|private|protected)?\s*(static\s+)?\w+\s*\(/,
      /^\s*\w+\s*:\s*(async\s+)?\([^)]*\)\s*=>/,
      /^\s*(get|set)\s+\w+\s*\(/,
      /^\s*constructor\s*\(/,
    ];

    return patterns.some((pattern) => pattern.test(line));
  }

  private parseFunctionSignature(line: string, languageId: string): FunctionSignature {
    const signature: FunctionSignature = {
      name: '',
      parameters: [],
      returnType: null,
      isAsync: false,
      isConstructor: false,
      isGetter: false,
      isSetter: false,
    };

    // Check for async
    signature.isAsync = /\basync\s+/.test(line);

    // Check for constructor
    signature.isConstructor = /\bconstructor\s*\(/.test(line);

    // Check for getter/setter
    signature.isGetter = /\bget\s+/.test(line);
    signature.isSetter = /\bset\s+/.test(line);

    // Extract function name
    const nameMatch =
      line.match(/(?:function\s+)?(\w+)\s*\(/) ||
      line.match(/\b(\w+)\s*:\s*(?:async\s+)?\(/) ||
      line.match(/(?:get|set)\s+(\w+)\s*\(/);
    if (nameMatch) {
      signature.name = nameMatch[1];
    }

    // Extract parameters
    const paramsMatch = line.match(/\(([^)]*)\)/);
    if (paramsMatch) {
      const paramsStr = paramsMatch[1];
      signature.parameters = this.parseParameters(paramsStr, languageId);
    }

    // Extract return type (TypeScript)
    const returnTypeMatch = line.match(/\)\s*:\s*([^{]+)/);
    if (returnTypeMatch) {
      signature.returnType = returnTypeMatch[1].trim();
    }

    return signature;
  }

  private parseParameters(paramsStr: string, languageId: string): Parameter[] {
    if (!paramsStr.trim()) {
      return [];
    }

    const params = paramsStr.split(',').map((param) => param.trim());
    return params.map((param) => {
      const parts = param.split(':').map((p) => p.trim());
      const nameMatch = parts[0].match(/(\w+)(\?)?/);

      return {
        name: nameMatch ? nameMatch[1] : parts[0],
        type: parts[1] || null,
        optional: param.includes('?'),
        defaultValue: param.includes('=') ? param.split('=')[1].trim() : null,
      };
    });
  }

  private generateFunctionBody(
    signature: FunctionSignature,
    languageId: string
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      'Generate function body',
      vscode.CompletionItemKind.Snippet
    );
    const indent = '  ';
    let body = '';

    // Constructor body
    if (signature.isConstructor) {
      body = this.generateConstructorBody(signature, indent);
    }
    // Getter body
    else if (signature.isGetter) {
      body = `${indent}return this._${signature.name}\n}`;
    }
    // Setter body
    else if (signature.isSetter) {
      const param = signature.parameters[0];
      body = `${indent}this._${signature.name} = ${param ? param.name : 'value'}\n}`;
    }
    // Regular function body
    else {
      body = this.generateRegularFunctionBody(signature, indent);
    }

    item.insertText = new vscode.SnippetString(body);
    item.detail = `Generate ${signature.name} implementation`;
    return item;
  }

  private generateConstructorBody(signature: FunctionSignature, indent: string): string {
    let body = '';

    // Initialize properties from parameters
    signature.parameters.forEach((param, index) => {
      body += `${indent}this.${param.name} = ${param.name}\n`;
    });

    body += '}';
    return body;
  }

  private generateRegularFunctionBody(signature: FunctionSignature, indent: string): string {
    let body = '';

    // Add parameter validation
    signature.parameters.forEach((param, index) => {
      if (!param.optional && !param.defaultValue) {
        body += `${indent}if (${param.name} === undefined) {\n`;
        body += `${indent}  throw new Error('Parameter ${param.name} is required')\n`;
        body += `${indent}}\n`;
      }
    });

    if (body) {
      body += '\n';
    }

    // Add function logic placeholder
    body += `${indent}\${1:// Implementation}\n`;

    // Add return statement if needed
    if (signature.returnType && signature.returnType !== 'void') {
      body += `\n${indent}return \${2:result}\n`;
    }

    body += '}';
    return body;
  }

  private getAsyncPatterns(signature: FunctionSignature): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = '  ';

    // Try-catch pattern for async
    const tryCatchItem = new vscode.CompletionItem(
      'async try-catch pattern',
      vscode.CompletionItemKind.Snippet
    );
    tryCatchItem.insertText = new vscode.SnippetString(
      `${indent}try {\n` +
        `${indent}  const result = await \${1:asyncOperation}()\n` +
        `${indent}  \${2:// Process result}\n` +
        `${indent}  return result\n` +
        `${indent}} catch (error) {\n` +
        `${indent}  console.error('Error in ${signature.name}:', error)\n` +
        `${indent}  throw error\n` +
        `${indent}}\n}`
    );
    tryCatchItem.detail = 'Async function with error handling';
    completions.push(tryCatchItem);

    // Promise.all pattern
    const promiseAllItem = new vscode.CompletionItem(
      'async Promise.all pattern',
      vscode.CompletionItemKind.Snippet
    );
    promiseAllItem.insertText = new vscode.SnippetString(
      `${indent}const results = await Promise.all([\n` +
        `${indent}  \${1:promise1},\n` +
        `${indent}  \${2:promise2}\n` +
        `${indent}])\n` +
        `${indent}\${3:// Process results}\n` +
        `${indent}return results\n}`
    );
    promiseAllItem.detail = 'Parallel async operations';
    completions.push(promiseAllItem);

    return completions;
  }

  private getReturnPatterns(signature: FunctionSignature): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const indent = '  ';

    // Return based on type
    if (signature.returnType) {
      const returnItem = new vscode.CompletionItem(
        `return ${signature.returnType}`,
        vscode.CompletionItemKind.Snippet
      );

      switch (signature.returnType.toLowerCase()) {
        case 'boolean':
          returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:true}\n}`);
          break;
        case 'number':
          returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:0}\n}`);
          break;
        case 'string':
          returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:''}\n}`);
          break;
        case 'array':
        case 'any[]':
          returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:[]}\n}`);
          break;
        default:
          if (signature.returnType.includes('[]')) {
            returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:[]}\n}`);
          } else if (signature.returnType.includes('Promise')) {
            returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:result}\n}`);
          } else {
            returnItem.insertText = new vscode.SnippetString(`${indent}return \${1:{}}\n}`);
          }
      }

      returnItem.detail = `Return ${signature.returnType}`;
      completions.push(returnItem);
    }

    return completions;
  }

  getConfiguration(): ModeConfiguration {
    return this.config;
  }
}

interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType: string | null;
  isAsync: boolean;
  isConstructor: boolean;
  isGetter: boolean;
  isSetter: boolean;
}

interface Parameter {
  name: string;
  type: string | null;
  optional: boolean;
  defaultValue: string | null;
}
