import { expect } from 'chai';
import { CircuitBreaker, CircuitState } from '../../../api/circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
    });
  });

  describe('Initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).to.equal(CircuitState.CLOSED);
    });

    it('should have zero counts', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).to.equal(0);
      expect(stats.successCount).to.equal(0);
    });
  });

  describe('Success handling', () => {
    it('should execute successful operations', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).to.equal('success');
      expect(circuitBreaker.getState()).to.equal(CircuitState.CLOSED);
    });

    it('should reset failure count on success', async () => {
      // First fail twice
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {}
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {}

      let stats = circuitBreaker.getStats();
      expect(stats.failureCount).to.equal(2);

      // Then succeed
      await circuitBreaker.execute(async () => 'success');

      stats = circuitBreaker.getStats();
      expect(stats.failureCount).to.equal(0);
    });
  });

  describe('Failure handling', () => {
    it('should count failures', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {}

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).to.equal(1);
    });

    it('should open circuit after threshold failures', async () => {
      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      expect(circuitBreaker.getState()).to.equal(CircuitState.OPEN);
    });

    it('should reject calls when circuit is open', async () => {
      circuitBreaker.trip();

      try {
        await circuitBreaker.execute(async () => 'success');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.include('Circuit breaker is OPEN');
      }
    });
  });

  describe('Half-open state', () => {
    beforeEach(() => {
      circuitBreaker.trip();
    });

    it('should transition to half-open after timeout', async () => {
      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next call should transition to half-open
      await circuitBreaker.execute(async () => 'success');

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).to.equal(1);
    });

    it('should close after success threshold in half-open', async () => {
      // Force to half-open
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Succeed twice
      await circuitBreaker.execute(async () => 'success');
      await circuitBreaker.execute(async () => 'success');

      expect(circuitBreaker.getState()).to.equal(CircuitState.CLOSED);
    });

    it('should reopen on failure in half-open', async () => {
      // Force to half-open
      await new Promise((resolve) => setTimeout(resolve, 1100));

      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {}

      expect(circuitBreaker.getState()).to.equal(CircuitState.OPEN);
    });
  });

  describe('State transitions', () => {
    it('should emit state change events', (done) => {
      circuitBreaker.on('stateChange', ({ from, to }) => {
        expect(from).to.equal(CircuitState.CLOSED);
        expect(to).to.equal(CircuitState.OPEN);
        done();
      });

      circuitBreaker.trip();
    });

    it('should reset to closed state', () => {
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).to.equal(CircuitState.OPEN);

      circuitBreaker.reset();
      expect(circuitBreaker.getState()).to.equal(CircuitState.CLOSED);

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).to.equal(0);
      expect(stats.successCount).to.equal(0);
    });
  });
});
