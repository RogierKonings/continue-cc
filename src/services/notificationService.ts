import * as vscode from 'vscode';

export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface NotificationOptions {
  type?: NotificationType;
  modal?: boolean;
  timeout?: number;
  actions?: NotificationAction[];
  persistent?: boolean;
}

export interface NotificationAction {
  title: string;
  action: () => void | Promise<void>;
  isCloseAffordance?: boolean;
}

interface QueuedNotification {
  message: string;
  options: NotificationOptions;
  resolve: (value: string | undefined) => void;
}

export class NotificationService {
  private notificationQueue: QueuedNotification[] = [];
  private isProcessing = false;
  private recentNotifications = new Map<string, number>();
  private notificationHistory: NotificationHistoryEntry[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadNotificationHistory();
  }

  /**
   * Show a notification with proper queueing and deduplication
   */
  public async showNotification(
    message: string,
    options: NotificationOptions = {}
  ): Promise<string | undefined> {
    // Check for duplicate notifications
    if (this.isDuplicate(message)) {
      return undefined;
    }

    return new Promise((resolve) => {
      this.notificationQueue.push({ message, options, resolve });
      this.processQueue();
    });
  }

  /**
   * Show a success notification
   */
  public async showSuccess(
    message: string,
    actions?: NotificationAction[]
  ): Promise<string | undefined> {
    return this.showNotification(message, {
      type: NotificationType.SUCCESS,
      actions,
      timeout: 3000,
    });
  }

  /**
   * Show an error notification
   */
  public async showError(
    message: string,
    error?: Error,
    actions?: NotificationAction[]
  ): Promise<string | undefined> {
    const fullMessage = error ? `${message}: ${error.message}` : message;

    // Log error to console
    console.error('[Claude Code]', fullMessage, error);

    return this.showNotification(fullMessage, {
      type: NotificationType.ERROR,
      actions,
      persistent: true,
    });
  }

  /**
   * Show a warning notification
   */
  public async showWarning(
    message: string,
    actions?: NotificationAction[]
  ): Promise<string | undefined> {
    return this.showNotification(message, {
      type: NotificationType.WARNING,
      actions,
      timeout: 5000,
    });
  }

  /**
   * Show an info notification
   */
  public async showInfo(
    message: string,
    actions?: NotificationAction[]
  ): Promise<string | undefined> {
    return this.showNotification(message, {
      type: NotificationType.INFO,
      actions,
      timeout: 5000,
    });
  }

  /**
   * Show a rate limit notification with retry action
   */
  public async showRateLimitNotification(retryAfter: number, onRetry: () => void): Promise<void> {
    const minutes = Math.ceil(retryAfter / 60);
    const message = `Claude Code API rate limit reached. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;

    await this.showWarning(message, [
      {
        title: 'Retry Now',
        action: onRetry,
      },
      {
        title: 'View Usage',
        action: () => vscode.commands.executeCommand('continue-cc.showUsageStatistics'),
      },
    ]);
  }

  /**
   * Show a progress notification for long operations
   */
  public async showProgressNotification(message: string, task: () => Promise<void>): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: message,
        cancellable: false,
      },
      task
    );
  }

  /**
   * Process the notification queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.notificationQueue.length > 0) {
      const notification = this.notificationQueue.shift()!;
      const result = await this.showNotificationInternal(
        notification.message,
        notification.options
      );
      notification.resolve(result);

      // Small delay between notifications
      if (this.notificationQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Internal method to show a notification
   */
  private async showNotificationInternal(
    message: string,
    options: NotificationOptions
  ): Promise<string | undefined> {
    const {
      type = NotificationType.INFO,
      modal = false,
      timeout,
      actions = [],
      persistent = false,
    } = options;

    // Record notification
    this.recordNotification(message, type);

    // Prepare action items
    const actionItems = actions.map((a) => a.title);

    let result: string | undefined;

    switch (type) {
      case NotificationType.SUCCESS:
        result = await this.showMessageWithTimeout(
          vscode.window.showInformationMessage,
          message,
          { modal },
          actionItems,
          timeout || 3000,
          persistent
        );
        break;

      case NotificationType.ERROR:
        result = await vscode.window.showErrorMessage(message, { modal }, ...actionItems);
        break;

      case NotificationType.WARNING:
        result = await this.showMessageWithTimeout(
          vscode.window.showWarningMessage,
          message,
          { modal },
          actionItems,
          timeout || 5000,
          persistent
        );
        break;

      case NotificationType.INFO:
      default:
        result = await this.showMessageWithTimeout(
          vscode.window.showInformationMessage,
          message,
          { modal },
          actionItems,
          timeout || 5000,
          persistent
        );
        break;
    }

    // Execute action if selected
    if (result) {
      const action = actions.find((a) => a.title === result);
      if (action) {
        try {
          await action.action();
        } catch (error) {
          console.error('Error executing notification action:', error);
        }
      }
    }

    return result;
  }

  /**
   * Show a message with automatic timeout
   */
  private async showMessageWithTimeout(
    showMessage: (
      message: string,
      options: any,
      ...items: string[]
    ) => Thenable<string | undefined>,
    message: string,
    options: any,
    items: string[],
    timeout: number,
    persistent: boolean
  ): Promise<string | undefined> {
    if (persistent || items.length > 0) {
      // Don't auto-dismiss if persistent or has actions
      return showMessage(message, options, ...items);
    }

    // Create a promise that resolves after timeout
    const timeoutPromise = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeout);
    });

    // Race between user action and timeout
    return Promise.race([showMessage(message, options, ...items), timeoutPromise]);
  }

  /**
   * Check if notification is a duplicate
   */
  private isDuplicate(message: string): boolean {
    const now = Date.now();
    const lastShown = this.recentNotifications.get(message);

    if (lastShown && now - lastShown < 5000) {
      return true;
    }

    this.recentNotifications.set(message, now);

    // Clean up old entries
    for (const [msg, time] of this.recentNotifications.entries()) {
      if (now - time > 60000) {
        this.recentNotifications.delete(msg);
      }
    }

    return false;
  }

  /**
   * Record notification in history
   */
  private recordNotification(message: string, type: NotificationType): void {
    const entry: NotificationHistoryEntry = {
      message,
      type,
      timestamp: new Date().toISOString(),
    };

    this.notificationHistory.push(entry);

    // Keep only last 100 notifications
    if (this.notificationHistory.length > 100) {
      this.notificationHistory = this.notificationHistory.slice(-100);
    }

    this.saveNotificationHistory();
  }

  /**
   * Get notification history
   */
  public getNotificationHistory(): NotificationHistoryEntry[] {
    return [...this.notificationHistory];
  }

  /**
   * Clear notification history
   */
  public clearNotificationHistory(): void {
    this.notificationHistory = [];
    this.saveNotificationHistory();
  }

  /**
   * Load notification history from storage
   */
  private loadNotificationHistory(): void {
    this.notificationHistory = this.context.globalState.get<NotificationHistoryEntry[]>(
      'continue-cc.notificationHistory',
      []
    );
  }

  /**
   * Save notification history to storage
   */
  private saveNotificationHistory(): void {
    this.context.globalState.update('continue-cc.notificationHistory', this.notificationHistory);
  }
}

interface NotificationHistoryEntry {
  message: string;
  type: NotificationType;
  timestamp: string;
}
