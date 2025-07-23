import * as vscode from 'vscode';

export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel;
  private debugMode: boolean;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Claude Code Continue');
    this.debugMode = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;

    if (data !== undefined) {
      formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return formattedMessage;
  }

  debug(message: string, data?: any): void {
    if (this.debugMode) {
      const formatted = this.formatMessage('DEBUG', message, data);
      this.outputChannel.appendLine(formatted);
      console.log(formatted);
    }
  }

  info(message: string, data?: any): void {
    const formatted = this.formatMessage('INFO', message, data);
    this.outputChannel.appendLine(formatted);
    console.log(formatted);
  }

  warn(message: string, data?: any): void {
    const formatted = this.formatMessage('WARN', message, data);
    this.outputChannel.appendLine(formatted);
    console.warn(formatted);
  }

  error(message: string, error?: Error | any): void {
    const errorData =
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error;

    const formatted = this.formatMessage('ERROR', message, errorData);
    this.outputChannel.appendLine(formatted);
    console.error(formatted);
  }

  show(): void {
    this.outputChannel.show();
  }

  clear(): void {
    this.outputChannel.clear();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export const logger = Logger.getInstance();
