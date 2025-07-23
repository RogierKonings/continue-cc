import * as vscode from 'vscode';

export class Logger {
  private static instance: Logger;
  private static outputChannel: vscode.OutputChannel;
  private debugMode: boolean;
  private componentName: string;

  constructor(componentName?: string) {
    this.componentName = componentName || 'General';
    this.debugMode = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('Claude Code Continue');
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] [${this.componentName}] ${message}`;

    if (data !== undefined) {
      formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return formattedMessage;
  }

  debug(message: string, data?: any): void {
    if (this.debugMode) {
      const formatted = this.formatMessage('DEBUG', message, data);
      Logger.outputChannel.appendLine(formatted);
      console.log(formatted);
    }
  }

  info(message: string, data?: any): void {
    const formatted = this.formatMessage('INFO', message, data);
    Logger.outputChannel.appendLine(formatted);
    console.log(formatted);
  }

  warn(message: string, data?: any): void {
    const formatted = this.formatMessage('WARN', message, data);
    Logger.outputChannel.appendLine(formatted);
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
    Logger.outputChannel.appendLine(formatted);
    console.error(formatted);
  }

  show(): void {
    Logger.outputChannel.show();
  }

  clear(): void {
    Logger.outputChannel.clear();
  }

  dispose(): void {
    // Output channel is shared, so we don't dispose it per instance
  }
}

export const logger = Logger.getInstance();
