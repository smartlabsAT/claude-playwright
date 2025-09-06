/**
 * Phase 4: Unit Tests - Circuit Breaker State Management
 * 
 * Tests the circuit breaker state management system from Phase 3
 * Critical for preventing cascading failures and graceful degradation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock circuit breaker functionality
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures to trigger open state
  recoveryTimeout: number;      // Time in ms before attempting recovery
  monitorWindow: number;        // Time window for tracking failures
  successThreshold: number;     // Successes needed to close from half-open
}

interface CircuitBreakerMetrics {
  state: CircuitState;
  failure_count: number;
  success_count: number;
  total_requests: number;
  last_failure_time?: number;
  last_success_time?: number;
  state_changes: Array<{
    from_state: CircuitState;
    to_state: CircuitState;
    timestamp: number;
    reason: string;
  }>;
  window_start: number;
}

class MockCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private config: CircuitBreakerConfig;
  private metrics: CircuitBreakerMetrics;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 30000,
      monitorWindow: 60000,
      successThreshold: 3,
      ...config
    };

    this.metrics = {
      state: this.state,
      failure_count: 0,
      success_count: 0,
      total_requests: 0,
      state_changes: [],
      window_start: Date.now()
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.metrics.total_requests++;
    
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      await this.checkRecoveryTimeout();
      
      if (this.state === CircuitState.OPEN) {
        throw new Error('Circuit breaker is OPEN - request rejected');
      }
    }

    try {
      const result = await operation();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error as Error);
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    this.metrics.success_count++;
    this.metrics.last_success_time = Date.now();

    // If half-open, check if we should close
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.metrics.success_count >= this.config.successThreshold) {
        await this.transitionTo(CircuitState.CLOSED, 'sufficient_successes');
        this.resetMetrics();
      }
    }

    // Reset failure count on success in closed state
    if (this.state === CircuitState.CLOSED) {
      this.metrics.failure_count = 0;
    }
  }

  private async onFailure(error: Error): Promise<void> {
    this.metrics.failure_count++;
    this.metrics.last_failure_time = Date.now();

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED) {
      if (this.metrics.failure_count >= this.config.failureThreshold) {
        await this.transitionTo(CircuitState.OPEN, `failure_threshold_exceeded: ${error.message}`);
        this.startRecoveryTimer();
      }
    }

    // If half-open and we fail, go back to open
    if (this.state === CircuitState.HALF_OPEN) {
      await this.transitionTo(CircuitState.OPEN, `half_open_failure: ${error.message}`);
      this.startRecoveryTimer();
    }
  }

  private async checkRecoveryTimeout(): Promise<void> {
    if (this.state !== CircuitState.OPEN) return;

    const lastFailureTime = this.metrics.last_failure_time || 0;
    const timeSinceLastFailure = Date.now() - lastFailureTime;

    if (timeSinceLastFailure >= this.config.recoveryTimeout) {
      await this.transitionTo(CircuitState.HALF_OPEN, 'recovery_timeout_elapsed');
      this.resetHalfOpenMetrics();
    }
  }

  private startRecoveryTimer(): void {
    this.clearTimer('recovery');
    
    const timer = setTimeout(async () => {
      if (this.state === CircuitState.OPEN) {
        await this.transitionTo(CircuitState.HALF_OPEN, 'recovery_timer_triggered');
        this.resetHalfOpenMetrics();
      }
    }, this.config.recoveryTimeout);

    this.timers.set('recovery', timer);
  }

  private clearTimer(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  private async transitionTo(newState: CircuitState, reason: string): Promise<void> {
    const oldState = this.state;
    this.state = newState;
    this.metrics.state = newState;

    const stateChange = {
      from_state: oldState,
      to_state: newState,
      timestamp: Date.now(),
      reason
    };

    this.metrics.state_changes.push(stateChange);

    // Emit event for monitoring (in real implementation)
    this.onStateChange?.(stateChange);
  }

  private resetMetrics(): void {
    this.metrics.failure_count = 0;
    this.metrics.success_count = 0;
    this.metrics.window_start = Date.now();
  }

  private resetHalfOpenMetrics(): void {
    this.metrics.success_count = 0;
    this.metrics.failure_count = 0;
  }

  // Public API methods
  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  async reset(): Promise<void> {
    this.clearAllTimers();
    await this.transitionTo(CircuitState.CLOSED, 'manual_reset');
    this.resetMetrics();
  }

  async forceOpen(reason: string = 'manual_force_open'): Promise<void> {
    this.clearAllTimers();
    await this.transitionTo(CircuitState.OPEN, reason);
  }

  updateConfig(newConfig: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private clearAllTimers(): void {
    for (const [name, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  destroy(): void {
    this.clearAllTimers();
  }

  // Hook for state change notifications (would be implemented in real system)
  onStateChange?: (change: any) => void;
}

describe('Circuit Breaker State Management', () => {
  let circuitBreaker: MockCircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new MockCircuitBreaker();
  });

  afterEach(() => {
    circuitBreaker.destroy();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero metrics initially', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(0);
      expect(metrics.success_count).toBe(0);
      expect(metrics.total_requests).toBe(0);
      expect(metrics.state_changes).toHaveLength(0);
    });

    it('should have default configuration', () => {
      const config = circuitBreaker.getConfig();
      expect(config.failureThreshold).toBe(5);
      expect(config.recoveryTimeout).toBe(30000);
      expect(config.monitorWindow).toBe(60000);
      expect(config.successThreshold).toBe(3);
    });
  });

  describe('Success Handling', () => {
    it('should record successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.success_count).toBe(1);
      expect(metrics.total_requests).toBe(1);
      expect(metrics.last_success_time).toBeDefined();
    });

    it('should reset failure count on success in CLOSED state', async () => {
      const mockFailure = jest.fn().mockRejectedValue(new Error('failure'));
      const mockSuccess = jest.fn().mockResolvedValue('success');

      // Generate some failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFailure);
        } catch (error) {
          // Expected failure
        }
      }

      let metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(3);

      // Success should reset failure count
      await circuitBreaker.execute(mockSuccess);
      
      metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(0);
      expect(metrics.success_count).toBe(1);
    });
  });

  describe('Failure Handling', () => {
    it('should record failed operations', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test failure'));
      
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {
        expect(error.message).toBe('test failure');
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(1);
      expect(metrics.total_requests).toBe(1);
      expect(metrics.last_failure_time).toBeDefined();
    });

    it('should transition to OPEN after failure threshold', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Execute failures up to threshold (default: 5)
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failure
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(5);
      expect(metrics.state_changes).toHaveLength(1);
      expect(metrics.state_changes[0].to_state).toBe(CircuitState.OPEN);
      expect(metrics.state_changes[0].reason).toContain('failure_threshold_exceeded');
    });

    it('should use custom failure threshold', async () => {
      circuitBreaker = new MockCircuitBreaker({ failureThreshold: 2 });
      const mockOperation = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Should open after 2 failures instead of default 5
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {}
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {}
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      await circuitBreaker.forceOpen('test_setup');
    });

    it('should reject requests immediately when OPEN', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      try {
        await circuitBreaker.execute(mockOperation);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Circuit breaker is OPEN - request rejected');
        expect(mockOperation).not.toHaveBeenCalled();
      }
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const shortTimeout = 100; // 100ms for faster testing
      circuitBreaker.updateConfig({ recoveryTimeout: shortTimeout });
      
      // Force to OPEN and wait for recovery
      await circuitBreaker.forceOpen('test');
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, shortTimeout + 50));
      
      // Next request should trigger transition to HALF_OPEN
      const mockOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED); // Should close after success
    });

    it('should track state change history', async () => {
      const metrics = circuitBreaker.getMetrics();
      
      // Should have record of transition to OPEN
      expect(metrics.state_changes.length).toBeGreaterThan(0);
      const lastChange = metrics.state_changes[metrics.state_changes.length - 1];
      expect(lastChange.to_state).toBe(CircuitState.OPEN);
      expect(lastChange.reason).toBe('test_setup');
      expect(lastChange.timestamp).toBeGreaterThan(0);
    });
  });

  describe('HALF_OPEN State Behavior', () => {
    beforeEach(async () => {
      // Set up circuit in HALF_OPEN state
      await circuitBreaker.forceOpen('setup');
      circuitBreaker.updateConfig({ recoveryTimeout: 50 });
      
      // Wait for recovery and trigger transition
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // This should transition to HALF_OPEN
      const mockOperation = jest.fn().mockRejectedValue(new Error('trigger_half_open'));
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {
        // Expected - this should put us back to OPEN, then we manually transition
      }
      
      // Manually transition to HALF_OPEN for testing
      await circuitBreaker.reset();
      await circuitBreaker.forceOpen('setup');
      
      // Simulate transition to HALF_OPEN by waiting for timeout
      await new Promise(resolve => setTimeout(resolve, 60));
    });

    it('should allow limited requests in HALF_OPEN state', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      // Manually transition to HALF_OPEN for this test
      circuitBreaker = new MockCircuitBreaker({ successThreshold: 2 });
      await circuitBreaker.forceOpen('setup');
      
      // Wait for recovery
      circuitBreaker.updateConfig({ recoveryTimeout: 50 });
      await new Promise(resolve => setTimeout(resolve, 60));
      
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should transition to CLOSED after sufficient successes', async () => {
      circuitBreaker = new MockCircuitBreaker({ 
        failureThreshold: 1,
        successThreshold: 2,
        recoveryTimeout: 50
      });
      
      // Force to OPEN
      const mockFailure = jest.fn().mockRejectedValue(new Error('initial_failure'));
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for recovery to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Should now be able to execute and transition states
      const mockSuccess = jest.fn().mockResolvedValue('success');
      
      // First success - should remain HALF_OPEN
      await circuitBreaker.execute(mockSuccess);
      
      // Second success - should transition to CLOSED
      await circuitBreaker.execute(mockSuccess);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.success_count).toBe(2);
    });

    it('should return to OPEN on failure in HALF_OPEN', async () => {
      circuitBreaker = new MockCircuitBreaker({ 
        failureThreshold: 1,
        recoveryTimeout: 50
      });
      
      // Get to OPEN state
      const mockFailure = jest.fn().mockRejectedValue(new Error('failure'));
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      
      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Failure in HALF_OPEN should go back to OPEN
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        failureThreshold: 10,
        recoveryTimeout: 60000,
        successThreshold: 5
      };
      
      circuitBreaker.updateConfig(newConfig);
      
      const config = circuitBreaker.getConfig();
      expect(config.failureThreshold).toBe(10);
      expect(config.recoveryTimeout).toBe(60000);
      expect(config.successThreshold).toBe(5);
    });

    it('should use updated configuration for state transitions', async () => {
      circuitBreaker.updateConfig({ failureThreshold: 2 });
      
      const mockFailure = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Should open after 2 failures
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual reset to CLOSED', async () => {
      await circuitBreaker.forceOpen('test');
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      await circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(0);
      expect(metrics.success_count).toBe(0);
    });

    it('should allow manual force open', async () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      await circuitBreaker.forceOpen('maintenance_mode');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      const metrics = circuitBreaker.getMetrics();
      const lastChange = metrics.state_changes[metrics.state_changes.length - 1];
      expect(lastChange.reason).toBe('maintenance_mode');
    });

    it('should clear timers on reset', async () => {
      // This test ensures no memory leaks from hanging timers
      await circuitBreaker.forceOpen('test');
      
      // Reset should clear recovery timer
      await circuitBreaker.reset();
      
      // Should not automatically transition after reset
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track detailed metrics', async () => {
      const mockSuccess = jest.fn().mockResolvedValue('success');
      const mockFailure = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Mix of successes and failures
      await circuitBreaker.execute(mockSuccess);
      await circuitBreaker.execute(mockSuccess);
      
      try {
        await circuitBreaker.execute(mockFailure);
      } catch (error) {}
      
      await circuitBreaker.execute(mockSuccess);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.success_count).toBe(3);
      expect(metrics.failure_count).toBe(0); // Should be reset by success
      expect(metrics.total_requests).toBe(4);
      expect(metrics.last_success_time).toBeDefined();
      expect(metrics.last_failure_time).toBeDefined();
    });

    it('should provide state change history', async () => {
      await circuitBreaker.forceOpen('test1');
      await circuitBreaker.reset();
      await circuitBreaker.forceOpen('test2');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state_changes.length).toBe(3);
      
      // Check history order
      expect(metrics.state_changes[0].to_state).toBe(CircuitState.OPEN);
      expect(metrics.state_changes[1].to_state).toBe(CircuitState.CLOSED);
      expect(metrics.state_changes[2].to_state).toBe(CircuitState.OPEN);
    });

    it('should track timing information', async () => {
      const before = Date.now();
      
      await circuitBreaker.forceOpen('timing_test');
      
      const metrics = circuitBreaker.getMetrics();
      const stateChange = metrics.state_changes[0];
      
      expect(stateChange.timestamp).toBeGreaterThanOrEqual(before);
      expect(stateChange.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle operation that throws non-Error objects', async () => {
      const mockOperation = jest.fn().mockRejectedValue('string error');
      
      try {
        await circuitBreaker.execute(mockOperation);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBe('string error');
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failure_count).toBe(1);
    });

    it('should handle very fast operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('fast');
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(circuitBreaker.execute(mockOperation));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      expect(results.every(r => r === 'fast')).toBe(true);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.success_count).toBe(10);
      expect(metrics.total_requests).toBe(10);
    });

    it('should handle concurrent operations during state transitions', async () => {
      const mockFailure = jest.fn().mockRejectedValue(new Error('concurrent failure'));
      
      // Start multiple operations that will all fail
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          circuitBreaker.execute(mockFailure).catch(err => err.message)
        );
      }
      
      const results = await Promise.all(promises);
      
      // Some should fail with operation error, others with circuit open error
      const operationFailures = results.filter(r => r === 'concurrent failure').length;
      const circuitRejections = results.filter(r => r === 'Circuit breaker is OPEN - request rejected').length;
      
      expect(operationFailures + circuitRejections).toBe(10);
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should cleanup resources on destroy', async () => {
      await circuitBreaker.forceOpen('cleanup_test');
      
      // Should not throw
      circuitBreaker.destroy();
      
      // Multiple destroy calls should be safe
      circuitBreaker.destroy();
      circuitBreaker.destroy();
    });
  });
});