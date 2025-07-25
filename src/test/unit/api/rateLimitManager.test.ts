import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import '../../setup';
import { RateLimitManager, RequestPriority } from '../../../api/rateLimitManager';
import { SubscriptionTier, UserInfo } from '../../../api/types';

describe('RateLimitManager', () => {
  let rateLimitManager: RateLimitManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;
  let statusBarItem: vscode.StatusBarItem;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    globalState = new Map();

    statusBarItem = {
      text: '',
      tooltip: '',
      command: undefined,
      backgroundColor: undefined,
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub(),
    } as any;

    mockContext = {
      globalState: {
        get: (key: string) => globalState.get(key),
        update: (key: string, value: any) => {
          globalState.set(key, value);
          return Promise.resolve();
        },
      },
    } as any;

    const createStatusBarStub = sinon.stub(vscode.window, 'createStatusBarItem');
    createStatusBarStub.returns(statusBarItem);

    rateLimitManager = new RateLimitManager(mockContext);
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
    rateLimitManager.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with FREE tier limits', () => {
      const usage = rateLimitManager.getCurrentUsage();
      expect(usage).to.have.lengthOf(2);
      expect(usage[0].period).to.equal('day');
      expect(usage[1].period).to.equal('month');
    });

    it('should show status bar item', () => {
      expect(statusBarItem.show as sinon.SinonStub).to.have.been.called;
      expect(statusBarItem.text).to.include('0%');
    });
  });

  describe('Subscription management', () => {
    it('should update limits when subscription changes', () => {
      const userInfo: UserInfo = {
        id: 'user123',
        email: 'test@example.com',
        subscription: SubscriptionTier.MAX,
        quotaUsage: {
          requests: { minute: 0, hour: 0, day: 0 },
          tokens: { day: 0, month: 0 },
        },
      };

      rateLimitManager.updateSubscription(userInfo);

      const canMake100Requests = rateLimitManager.checkAndRecordRequest(0, RequestPriority.NORMAL);
      expect(canMake100Requests).to.be.true;
    });
  });

  describe('Request tracking', () => {
    it('should track requests within time windows', async () => {
      await rateLimitManager.checkAndRecordRequest(100);
      await rateLimitManager.checkAndRecordRequest(200);

      const usage = rateLimitManager.getCurrentUsage();
      const dayUsage = usage.find((u) => u.period === 'day');

      expect(dayUsage?.requests).to.equal(2);
      expect(dayUsage?.tokens).to.equal(300);
    });

    it('should respect minute rate limits', async () => {
      // FREE tier has 10 requests per minute
      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimitManager.checkAndRecordRequest(0);
        expect(allowed).to.be.true;
      }

      const denied = await rateLimitManager.checkAndRecordRequest(0);
      expect(denied).to.be.false;
    });

    it('should clean up old requests', async () => {
      await rateLimitManager.checkAndRecordRequest(100);

      // Advance time by 1 minute
      clock.tick(61 * 1000);

      await rateLimitManager.checkAndRecordRequest(200);

      const usage = rateLimitManager.getCurrentUsage();
      const dayUsage = usage.find((u) => u.period === 'day');

      // Should have both requests in day count
      expect(dayUsage?.requests).to.equal(2);
    });
  });

  describe('Usage warnings', () => {
    it('should emit warning at 80% usage', async () => {
      let warningEmitted = false;
      rateLimitManager.on('usageWarning', () => {
        warningEmitted = true;
      });

      const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage');

      // FREE tier has 500 requests per day
      for (let i = 0; i < 400; i++) {
        await rateLimitManager.checkAndRecordRequest(0);
      }

      expect(warningEmitted).to.be.true;
      expect(showWarningStub).to.have.been.calledWith(sinon.match(/80% of your daily API limit/));
    });

    it('should update status bar color at high usage', async () => {
      // Use 90% of daily limit
      for (let i = 0; i < 450; i++) {
        await rateLimitManager.checkAndRecordRequest(0);
      }

      expect(statusBarItem.text).to.include('$(alert)');
      expect(statusBarItem.backgroundColor).to.exist;
    });
  });

  describe('Request queueing', () => {
    it('should queue requests by priority', async () => {
      const results: number[] = [];

      const promise1 = rateLimitManager.queueRequest(async () => {
        results.push(1);
        return 1;
      }, RequestPriority.LOW);

      const promise2 = rateLimitManager.queueRequest(async () => {
        results.push(2);
        return 2;
      }, RequestPriority.HIGH);

      const promise3 = rateLimitManager.queueRequest(async () => {
        results.push(3);
        return 3;
      }, RequestPriority.NORMAL);

      // Process queue
      clock.tick(10000);
      await Promise.all([promise1, promise2, promise3]);

      // High priority should execute first
      expect(results[0]).to.equal(2);
      expect(results[1]).to.equal(3);
      expect(results[2]).to.equal(1);
    });

    it('should reject queued requests on timeout', async () => {
      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        await rateLimitManager.checkAndRecordRequest(0);
      }

      const promise = rateLimitManager.queueRequest(async () => 'result');

      // Advance time past timeout
      clock.tick(301000);

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).to.include('timeout');
      }
    });
  });

  describe('Priority-based degradation', () => {
    it('should reject low priority requests at 90% usage', async () => {
      // Use 90% of daily limit
      for (let i = 0; i < 450; i++) {
        await rateLimitManager.checkAndRecordRequest(0);
      }

      const lowPriority = await rateLimitManager.checkAndRecordRequest(0, RequestPriority.LOW);
      const highPriority = await rateLimitManager.checkAndRecordRequest(0, RequestPriority.HIGH);

      expect(lowPriority).to.be.false;
      expect(highPriority).to.be.true;
    });

    it('should only allow critical requests at 100% usage', async () => {
      // Use 100% of daily limit
      for (let i = 0; i < 500; i++) {
        await rateLimitManager.checkAndRecordRequest(0);
      }

      const normal = await rateLimitManager.checkAndRecordRequest(0, RequestPriority.NORMAL);
      const critical = await rateLimitManager.checkAndRecordRequest(0, RequestPriority.CRITICAL);

      expect(normal).to.be.false;
      expect(critical).to.be.true;
    });
  });

  describe('Daily reset', () => {
    it('should reset daily counts at midnight', async () => {
      await rateLimitManager.checkAndRecordRequest(1000);

      let resetEmitted = false;
      rateLimitManager.on('dailyReset', () => {
        resetEmitted = true;
      });

      // Advance to next day
      clock.tick(24 * 60 * 60 * 1000);

      // Trigger cleanup
      const usage = rateLimitManager.getCurrentUsage();
      const dayUsage = usage.find((u) => u.period === 'day');

      expect(resetEmitted).to.be.true;
      expect(dayUsage?.requests).to.equal(0);
      expect(dayUsage?.tokens).to.equal(0);
    });
  });

  describe('Header updates', () => {
    it('should emit rate limit exceeded event', () => {
      let eventEmitted = false;
      let eventHeaders: any;

      rateLimitManager.on('rateLimitExceeded', (headers) => {
        eventEmitted = true;
        eventHeaders = headers;
      });

      rateLimitManager.updateFromHeaders({
        limit: 100,
        remaining: 0,
        reset: Date.now() + 3600000,
        retryAfter: 60,
      });

      expect(eventEmitted).to.be.true;
      expect(eventHeaders.retryAfter).to.equal(60);
    });
  });

  describe('Cleanup', () => {
    it('should clear queue on dispose', async () => {
      const promise = rateLimitManager.queueRequest(async () => 'result');

      rateLimitManager.dispose();

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).to.include('Queue cleared');
      }
    });
  });
});
