import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  successThreshold?: number;
  monitoringPeriod?: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private readonly logger: Logger;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly monitoringPeriod: number;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    super();
    this.logger = new Logger(`CircuitBreaker:${name}`);

    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.successThreshold = options.successThreshold ?? 2;
    this.monitoringPeriod = options.monitoringPeriod ?? 60000;
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      const timeSinceFirstFailure = Date.now() - (this.lastFailureTime - this.monitoringPeriod);

      if (timeSinceFirstFailure <= this.monitoringPeriod) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttemptTime = Date.now() + this.resetTimeout;
        this.logger.warn(`Circuit opened due to ${this.failureCount} failures`);
        break;

      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        this.logger.info('Circuit half-open, testing with limited requests');
        break;

      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.info('Circuit closed, normal operation resumed');
        break;
    }

    this.emit('stateChange', { from: oldState, to: newState });
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getStats(): Record<string, unknown> {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null,
    };
  }

  public reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  public trip(): void {
    this.transitionTo(CircuitState.OPEN);
  }
}
