import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { RateLimits, RateLimitHeaders, UserInfo, UsageStats } from './types';
import { SubscriptionTier } from './types';
import { Logger } from '../utils/logger';

interface RequestRecord {
  timestamp: number;
  tokens?: number;
}

interface UsageWindow {
  requests: RequestRecord[];
  tokens: number;
}

interface StoredUsageData {
  minute: UsageWindow;
  hour: UsageWindow;
  day: UsageWindow;
  month: UsageWindow;
  lastReset: {
    day: string;
    month: string;
  };
}

const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, RateLimits> = {
  [SubscriptionTier.FREE]: {
    requests: {
      perMinute: 10,
      perHour: 100,
      perDay: 500,
    },
    tokens: {
      perDay: 10000,
      perMonth: 100000,
    },
  },
  [SubscriptionTier.PRO]: {
    requests: {
      perMinute: 50,
      perHour: 1000,
      perDay: 5000,
    },
    tokens: {
      perDay: 100000,
      perMonth: 2000000,
    },
  },
  [SubscriptionTier.MAX]: {
    requests: {
      perMinute: 100,
      perHour: 2000,
      perDay: 10000,
    },
    tokens: {
      perDay: 1000000,
      perMonth: 20000000,
    },
  },
};

export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

interface QueuedRequest {
  id: string;
  priority: RequestPriority;
  timestamp: number;
  execute: () => Promise<any>;
  reject: (error: Error) => void;
}

export class RateLimitManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly context: vscode.ExtensionContext;
  private subscription: SubscriptionTier = SubscriptionTier.FREE;
  private limits: RateLimits;
  private usageData: StoredUsageData = {
    minute: { requests: [], tokens: 0 },
    hour: { requests: [], tokens: 0 },
    day: { requests: [], tokens: 0 },
    month: { requests: [], tokens: 0 },
    lastReset: {
      day: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
    },
  };
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue: boolean = false;
  private statusBarItem: vscode.StatusBarItem;
  private lastHeaderUpdate: RateLimitHeaders | null = null;

  constructor(context: vscode.ExtensionContext) {
    super();
    this.context = context;
    this.logger = new Logger('RateLimitManager');
    this.limits = SUBSCRIPTION_LIMITS[this.subscription];

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    this.loadUsageData();
    this.setupResetTimers();
    this.updateStatusBar();
  }

  private loadUsageData(): void {
    const stored = this.context.globalState.get<StoredUsageData>('rateLimitUsage');
    const now = new Date();

    this.usageData = stored || {
      minute: { requests: [], tokens: 0 },
      hour: { requests: [], tokens: 0 },
      day: { requests: [], tokens: 0 },
      month: { requests: [], tokens: 0 },
      lastReset: {
        day: now.toISOString().split('T')[0],
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      },
    };

    this.cleanupOldRecords();
  }

  private saveUsageData(): void {
    this.context.globalState.update('rateLimitUsage', this.usageData);
  }

  private cleanupOldRecords(): void {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * oneMinute;
    const oneDay = 24 * oneHour;

    this.usageData.minute.requests = this.usageData.minute.requests.filter(
      (r) => now - r.timestamp < oneMinute
    );
    this.usageData.hour.requests = this.usageData.hour.requests.filter(
      (r) => now - r.timestamp < oneHour
    );
    this.usageData.day.requests = this.usageData.day.requests.filter(
      (r) => now - r.timestamp < oneDay
    );

    const currentDay = new Date().toISOString().split('T')[0];
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    if (this.usageData.lastReset.day !== currentDay) {
      this.usageData.day = { requests: [], tokens: 0 };
      this.usageData.lastReset.day = currentDay;
      this.emit('dailyReset');
    }

    if (this.usageData.lastReset.month !== currentMonth) {
      this.usageData.month = { requests: [], tokens: 0 };
      this.usageData.lastReset.month = currentMonth;
      this.emit('monthlyReset');
    }
  }

  private setupResetTimers(): void {
    setInterval(() => {
      this.cleanupOldRecords();
      this.updateStatusBar();
      this.processQueue();
    }, 10000);

    const scheduleNextDayReset = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilReset = tomorrow.getTime() - now.getTime();

      setTimeout(() => {
        this.usageData.day = { requests: [], tokens: 0 };
        this.saveUsageData();
        this.emit('dailyReset');
        this.updateStatusBar();
        scheduleNextDayReset();
      }, msUntilReset);
    };

    scheduleNextDayReset();
  }

  public updateSubscription(userInfo: UserInfo): void {
    this.subscription = userInfo.subscription;
    this.limits = SUBSCRIPTION_LIMITS[this.subscription];
    this.logger.info(`Updated subscription tier to ${this.subscription}`);
    this.emit('subscriptionUpdated', this.subscription);
    this.updateStatusBar();
  }

  public updateFromHeaders(headers: RateLimitHeaders): void {
    this.lastHeaderUpdate = headers;

    if (headers.remaining === 0 && headers.retryAfter) {
      this.emit('rateLimitExceeded', headers);
    }

    this.updateStatusBar();
  }

  public async checkAndRecordRequest(
    tokens: number = 0,
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<boolean> {
    this.cleanupOldRecords();

    const usage = this.getCurrentUsage();
    const canProceed = this.canMakeRequest(usage, priority);

    if (!canProceed) {
      this.logger.warn('Rate limit would be exceeded', { usage, priority });
      return false;
    }

    this.recordRequest(tokens);
    return true;
  }

  private canMakeRequest(usage: UsageStats[], priority: RequestPriority): boolean {
    const dayUsage = usage.find((u) => u.period === 'day');

    if (!dayUsage) return true;

    if (dayUsage.percentageUsed >= 90 && priority < RequestPriority.HIGH) {
      return false;
    }

    if (dayUsage.percentageUsed >= 100) {
      return priority === RequestPriority.CRITICAL;
    }

    const minuteCount = this.usageData.minute.requests.length;
    if (minuteCount >= this.limits.requests.perMinute) {
      return false;
    }

    return true;
  }

  private recordRequest(tokens: number): void {
    const record: RequestRecord = {
      timestamp: Date.now(),
      tokens,
    };

    this.usageData.minute.requests.push(record);
    this.usageData.hour.requests.push(record);
    this.usageData.day.requests.push(record);
    this.usageData.month.requests.push(record);

    this.usageData.day.tokens += tokens;
    this.usageData.month.tokens += tokens;

    this.saveUsageData();
    this.updateStatusBar();

    const usage = this.getCurrentUsage();
    const dayUsage = usage.find((u) => u.period === 'day');

    if (dayUsage && dayUsage.percentageUsed >= 80) {
      this.emit('usageWarning', dayUsage);
      vscode.window.showWarningMessage(
        `You've used ${dayUsage.percentageUsed.toFixed(0)}% of your daily API limit`
      );
    }
  }

  public getCurrentUsage(): UsageStats[] {
    this.cleanupOldRecords();

    return [
      {
        period: 'day',
        requests: this.usageData.day.requests.length,
        tokens: this.usageData.day.tokens,
        percentageUsed: (this.usageData.day.requests.length / this.limits.requests.perDay) * 100,
      },
      {
        period: 'month',
        requests: this.usageData.month.requests.length,
        tokens: this.usageData.month.tokens,
        percentageUsed: (this.usageData.month.tokens / this.limits.tokens.perMonth) * 100,
      },
    ];
  }

  public async queueRequest<T>(
    execute: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `${Date.now()}-${Math.random()}`,
        priority,
        timestamp: Date.now(),
        execute: async () => {
          try {
            const result = await execute();
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
        reject,
      };

      this.requestQueue.push(request);
      this.requestQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0) {
        const usage = this.getCurrentUsage();
        const request = this.requestQueue[0];

        if (!this.canMakeRequest(usage, request.priority)) {
          if (Date.now() - request.timestamp > 300000) {
            request.reject(new Error('Request timeout in queue'));
            this.requestQueue.shift();
          }
          break;
        }

        this.requestQueue.shift();

        try {
          await request.execute();
        } catch (error) {
          this.logger.error('Queued request failed', { error });
        }

        await this.delay(this.getRequestSpacing());
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private getRequestSpacing(): number {
    const baseSpacing = 60000 / this.limits.requests.perMinute;
    const jitter = Math.random() * 100;
    return Math.max(baseSpacing + jitter, 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateStatusBar(): void {
    const usage = this.getCurrentUsage();
    const dayUsage = usage.find((u) => u.period === 'day');

    if (!dayUsage) return;

    const percentage = dayUsage.percentageUsed;
    let icon = '$(check)';
    let color: vscode.ThemeColor | undefined;

    if (percentage >= 90) {
      icon = '$(alert)';
      color = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (percentage >= 80) {
      icon = '$(warning)';
      color = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    this.statusBarItem.text = `${icon} API: ${percentage.toFixed(0)}%`;
    this.statusBarItem.tooltip =
      `Daily: ${dayUsage.requests}/${this.limits.requests.perDay} requests\n` +
      `Tokens: ${dayUsage.tokens.toLocaleString()}/${this.limits.tokens.perDay.toLocaleString()}`;
    this.statusBarItem.backgroundColor = color;
    this.statusBarItem.command = 'continue-cc.showUsageDetails';
    this.statusBarItem.show();
  }

  public getQueueLength(): number {
    return this.requestQueue.length;
  }

  public clearQueue(): void {
    this.requestQueue.forEach((request) => {
      request.reject(new Error('Queue cleared'));
    });
    this.requestQueue = [];
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.clearQueue();
    this.removeAllListeners();
  }
}
