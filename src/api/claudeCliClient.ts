import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ClaudeCliResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use: {
      web_search_requests: number;
    };
    service_tier: string;
  };
}

export interface ClaudeCliError {
  type: string;
  subtype: string;
  is_error: true;
  error: string;
  error_type?: string;
}

export interface CompletionRequest {
  prompt: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface CompletionResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost?: number;
}

export class ClaudeCliClient {
  private claudeCommand: string = 'claude';

  constructor() {}

  /**
   * Check if Claude CLI is available and authenticated
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${this.claudeCommand} --version`);
      return stdout.includes('Claude Code');
    } catch {
      return false;
    }
  }

  /**
   * Test authentication by making a simple request
   */
  async testAuthentication(): Promise<boolean> {
    try {
      const response = await this.makeRequest({
        prompt: 'test authentication',
      });
      return !!response.text;
    } catch {
      return false;
    }
  }

  /**
   * Make a completion request to Claude CLI
   */
  async makeRequest(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const args = ['--print', '--output-format', 'json'];

      if (request.model) {
        args.push('--model', request.model);
      }

      // Build the full prompt with context if provided
      let fullPrompt = request.prompt;
      if (request.context) {
        fullPrompt = `Context:\n${request.context}\n\nRequest:\n${request.prompt}`;
      }

      // Escape the prompt for shell execution
      const escapedPrompt = this.escapeShellArg(fullPrompt);

      const command = `${this.claudeCommand} ${args.join(' ')} ${escapedPrompt}`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      if (stderr) {
        console.warn('Claude CLI stderr:', stderr);
      }

      const response = JSON.parse(stdout) as ClaudeCliResponse | ClaudeCliError;

      if (response.is_error) {
        const errorResponse = response as ClaudeCliError;
        throw new Error(`Claude CLI error: ${errorResponse.error}`);
      }

      const successResponse = response as ClaudeCliResponse;

      return {
        text: successResponse.result,
        usage: {
          inputTokens:
            successResponse.usage.input_tokens +
            successResponse.usage.cache_creation_input_tokens +
            successResponse.usage.cache_read_input_tokens,
          outputTokens: successResponse.usage.output_tokens,
          totalTokens:
            successResponse.usage.input_tokens +
            successResponse.usage.cache_creation_input_tokens +
            successResponse.usage.cache_read_input_tokens +
            successResponse.usage.output_tokens,
        },
        cost: successResponse.total_cost_usd,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude CLI request failed: ${error.message}`);
      }
      throw new Error('Claude CLI request failed with unknown error');
    }
  }

  /**
   * Make a code completion request with specific formatting
   */
  async getCodeCompletion(request: {
    code: string;
    language?: string;
    filename?: string;
    cursorPosition?: number;
    maxTokens?: number;
  }): Promise<CompletionResponse> {
    const prompt = this.buildCodeCompletionPrompt(request);

    return this.makeRequest({
      prompt,
      maxTokens: request.maxTokens || 200,
      temperature: 0.2, // Lower temperature for code completion
    });
  }

  private buildCodeCompletionPrompt(request: {
    code: string;
    language?: string;
    filename?: string;
    cursorPosition?: number;
  }): string {
    let prompt = 'Complete the following code:\n\n';

    if (request.filename) {
      prompt += `File: ${request.filename}\n`;
    }

    if (request.language) {
      prompt += `Language: ${request.language}\n`;
    }

    prompt += '\n```';
    if (request.language) {
      prompt += request.language;
    }
    prompt += '\n';

    if (request.cursorPosition !== undefined) {
      const beforeCursor = request.code.substring(0, request.cursorPosition);
      const afterCursor = request.code.substring(request.cursorPosition);
      prompt += beforeCursor + '<CURSOR>' + afterCursor;
    } else {
      prompt += request.code;
    }

    prompt += '\n```\n\n';
    prompt += 'Provide only the completion for the code at the cursor position. ';
    prompt += 'Do not include explanations or the existing code in your response.';

    return prompt;
  }

  private escapeShellArg(arg: string): string {
    // Escape for shell execution - wrap in single quotes and escape any single quotes
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }

  /**
   * Get user information from Claude CLI config
   */
  async getUserInfo(): Promise<{ email?: string; username?: string; authenticated: boolean }> {
    try {
      // Try to make a simple request to verify authentication
      const isAuth = await this.testAuthentication();

      if (isAuth) {
        return {
          username: 'Claude Code User',
          authenticated: true,
        };
      } else {
        return {
          authenticated: false,
        };
      }
    } catch {
      return {
        authenticated: false,
      };
    }
  }
}
