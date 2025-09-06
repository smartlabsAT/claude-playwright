/**
 * Circuit Breaker Foundation - Phase 3A Implementation
 * 
 * Implements a robust circuit breaker system that prevents cascading failures
 * and provides graceful degradation when MCP tools fail.
 * 
 * Key Features:
 * - Sliding window failure tracking (60s default)
 * - Three states: CLOSED, OPEN, HALF_OPEN
 * - Configurable failure threshold (50% default)
 * - Exponential backoff for recovery attempts
 * - Per-tool failure statistics
 * - State persistence across restarts
 * - Comprehensive error classification
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';

// ============= INTERFACES & TYPES =============

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerConfig {
  /** Failure threshold percentage (0-1) that triggers OPEN state */
  failureThreshold: number;
  /** Timeout in milliseconds before attempting reset from OPEN to HALF_OPEN */
  timeout: number;
  /** Sliding window duration in milliseconds for failure tracking */
  monitoringWindow: number;
  /** Maximum number of consecutive failures before immediate OPEN */
  maxConsecutiveFailures: number;
  /** Initial backoff delay in milliseconds */
  initialBackoffDelay: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoffDelay: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Half-open test threshold - max requests to allow in HALF_OPEN state */
  halfOpenThreshold: number;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Error classification for determining retriability
 */
export enum ErrorType {
  RETRIABLE = 'retriable',
  NON_RETRIABLE = 'non_retriable',
  BROWSER_CRASH = 'browser_crash',
  NETWORK_TIMEOUT = 'network_timeout',
  ELEMENT_NOT_FOUND = 'element_not_found',
  MEMORY_PRESSURE = 'memory_pressure',
  CONNECTION_FAILURE = 'connection_failure',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN = 'unknown'
}

/**
 * Failure record for sliding window tracking
 */
interface FailureRecord {
  timestamp: number;
  errorType: ErrorType;
  errorMessage: string;
  retriable: boolean;
}

/**
 * Success record for performance tracking
 */
interface SuccessRecord {
  timestamp: number;
  duration: number;
}

/**
 * Tool statistics for monitoring
 */
interface ToolStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  retriableFailures: number;
  nonRetriableFailures: number;
  averageResponseTime: number;
  lastCallTime: number;
  consecutiveFailures: number;
  circuitBreakerTrips: number;
}

/**
 * Circuit breaker metrics for monitoring
 */
export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureRate: number;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  timeInState: number;
  lastStateChange: number;
  nextRetryTime?: number;
  backoffDelay: number;
  halfOpenCalls: number;
  toolStats: Record<string, ToolStats>;
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(toolName: string, nextRetryTime: number) {
    super(`Circuit breaker is OPEN for tool '${toolName}'. Next retry at ${new Date(nextRetryTime).toISOString()}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============= ERROR CLASSIFICATION SYSTEM =============

/**
 * Error classifier for determining if errors should trigger circuit breaker
 */
export class ErrorClassifier {
  /**
   * Classify an error and determine if it's retriable
   */
  static classifyError(error: Error | unknown): { type: ErrorType; retriable: boolean; shouldTrip: boolean } {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Browser crash indicators
    if (errorMessage.includes('browser') && (
        errorMessage.includes('crash') ||
        errorMessage.includes('disconnected') ||
        errorMessage.includes('closed') ||
        errorMessage.includes('not found')
      )) {
      return { type: ErrorType.BROWSER_CRASH, retriable: true, shouldTrip: true };
    }
    
    // Network timeout indicators
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('connection timed out') ||
        errorMessage.includes('request timeout')) {
      return { type: ErrorType.NETWORK_TIMEOUT, retriable: true, shouldTrip: true };
    }
    
    // Element not found - common but retriable
    if (errorMessage.includes('element') && (
        errorMessage.includes('not found') ||
        errorMessage.includes('not visible') ||
        errorMessage.includes('timeout')
      )) {
      return { type: ErrorType.ELEMENT_NOT_FOUND, retriable: true, shouldTrip: false };
    }
    
    // Memory pressure indicators
    if (errorMessage.includes('memory') ||
        errorMessage.includes('out of memory') ||
        errorMessage.includes('heap')) {
      return { type: ErrorType.MEMORY_PRESSURE, retriable: false, shouldTrip: true };
    }
    
    // Connection failures
    if (errorMessage.includes('connection') && (
        errorMessage.includes('refused') ||
        errorMessage.includes('failed') ||
        errorMessage.includes('reset')
      )) {
      return { type: ErrorType.CONNECTION_FAILURE, retriable: true, shouldTrip: true };
    }
    
    // Validation errors - typically non-retriable
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('malformed')) {
      return { type: ErrorType.VALIDATION_ERROR, retriable: false, shouldTrip: false };
    }
    
    // Default to retriable unknown error
    return { type: ErrorType.UNKNOWN, retriable: true, shouldTrip: true };
  }
}

// ============= MAIN CIRCUIT BREAKER CLASS =============

/**
 * Main circuit breaker implementation with sliding window failure tracking
 */
export class MCPCircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: FailureRecord[] = [];
  private successes: SuccessRecord[] = [];
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();
  private backoffDelay = 0;
  private halfOpenCalls = 0;
  private toolStats = new Map<string, ToolStats>();
  private persistenceFile: string;
  
  constructor(private config: CircuitBreakerConfig) {
    this.backoffDelay = config.initialBackoffDelay;
    this.persistenceFile = path.join(ProjectPaths.getCacheDir(), 'circuit-breaker-state.json');
    this.loadPersistedState();
  }
  
  /**
   * Create circuit breaker with default configuration
   */
  static createDefault(): MCPCircuitBreaker {
    return new MCPCircuitBreaker({
      failureThreshold: 0.5,           // 50% failure rate triggers open
      timeout: 30000,                  // 30s timeout before attempting reset
      monitoringWindow: 60000,         // 60s sliding window
      maxConsecutiveFailures: 5,       // Max consecutive failures
      initialBackoffDelay: 1000,       // 1s initial backoff
      maxBackoffDelay: 60000,          // 60s max backoff
      backoffMultiplier: 2,            // Exponential backoff
      halfOpenThreshold: 3             // Max 3 requests in HALF_OPEN
    });
  }
  
  /**
   * Execute a tool operation with circuit breaker protection
   */
  async execute<T>(toolName: string, operation: () => Promise<T>): Promise<T> {
    // Check if circuit breaker should allow this call
    const canExecute = this.canExecute(toolName);
    if (!canExecute.allowed) {
      throw new CircuitBreakerOpenError(toolName, canExecute.nextRetryTime!);
    }
    
    const startTime = Date.now();
    this.updateToolStats(toolName, 'call');
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.onSuccess(toolName, duration);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.onFailure(toolName, error, duration);
      throw error;
    }
  }
  
  /**
   * Check if circuit breaker allows execution
   */
  private canExecute(toolName: string): { allowed: boolean; nextRetryTime?: number } {
    const now = Date.now();
    
    // Clean up old records outside monitoring window
    this.cleanupOldRecords(now);
    
    switch (this.state) {
      case 'CLOSED':
        return { allowed: true };
        
      case 'OPEN':
        const nextRetryTime = this.lastStateChange + this.backoffDelay;
        if (now >= nextRetryTime) {
          // Move to HALF_OPEN state
          this.transitionToHalfOpen();
          return { allowed: true };
        }
        return { allowed: false, nextRetryTime };
        
      case 'HALF_OPEN':
        if (this.halfOpenCalls < this.config.halfOpenThreshold) {
          this.halfOpenCalls++;
          return { allowed: true };
        }
        return { allowed: false, nextRetryTime: now + this.backoffDelay };
        
      default:
        return { allowed: false };
    }
  }
  
  /**
   * Handle successful operation
   */
  private onSuccess(toolName: string, duration: number): void {
    const now = Date.now();
    
    // Record success
    this.successes.push({ timestamp: now, duration });
    this.updateToolStats(toolName, 'success', duration);
    
    // Reset consecutive failures on success
    this.consecutiveFailures = 0;
    
    // State transitions based on success
    switch (this.state) {
      case 'HALF_OPEN':
        // Transition back to CLOSED after successful half-open test
        this.transitionToClosed();
        break;
        
      case 'OPEN':
        // This shouldn't happen, but handle it gracefully
        console.error('[CircuitBreaker] Unexpected success in OPEN state - transitioning to CLOSED');
        this.transitionToClosed();
        break;
    }
  }
  
  /**
   * Handle failed operation
   */
  private onFailure(toolName: string, error: Error | unknown, duration: number): void {
    const now = Date.now();
    const classification = ErrorClassifier.classifyError(error);
    
    // Record failure if it should count towards circuit breaker
    if (classification.shouldTrip) {
      this.failures.push({
        timestamp: now,
        errorType: classification.type,
        errorMessage: error instanceof Error ? error.message : String(error),
        retriable: classification.retriable
      });
      
      this.consecutiveFailures++;
      this.lastFailureTime = now;
    }
    
    // Update tool statistics
    this.updateToolStats(toolName, 'failure', duration, classification.type);
    
    // Check if circuit breaker should trip
    if (this.shouldTrip()) {
      this.transitionToOpen(toolName);
    }
  }
  
  /**
   * Check if circuit breaker should trip based on failure rate or consecutive failures
   */
  private shouldTrip(): boolean {
    // Trip on too many consecutive failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      return true;
    }
    
    // Trip on failure rate threshold
    const now = Date.now();
    const recentFailures = this.failures.filter(f => now - f.timestamp <= this.config.monitoringWindow);
    const recentSuccesses = this.successes.filter(s => now - s.timestamp <= this.config.monitoringWindow);
    
    const totalCalls = recentFailures.length + recentSuccesses.length;
    if (totalCalls === 0) return false;
    
    const failureRate = recentFailures.length / totalCalls;
    return failureRate >= this.config.failureThreshold;
  }
  
  /**
   * Transition to OPEN state
   */
  private transitionToOpen(toolName: string): void {
    if (this.state === 'OPEN') return;
    
    console.error(`[CircuitBreaker] Tripping circuit breaker for tool '${toolName}' - too many failures`);
    this.state = 'OPEN';
    this.lastStateChange = Date.now();
    this.halfOpenCalls = 0;
    
    // Increase backoff delay
    this.backoffDelay = Math.min(
      this.backoffDelay * this.config.backoffMultiplier,
      this.config.maxBackoffDelay
    );
    
    // Update tool stats
    const stats = this.toolStats.get(toolName);
    if (stats) {
      stats.circuitBreakerTrips++;
    }
    
    this.persistState();
  }
  
  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    console.error('[CircuitBreaker] Transitioning to HALF_OPEN - testing if service recovered');
    this.state = 'HALF_OPEN';
    this.lastStateChange = Date.now();
    this.halfOpenCalls = 0;
    this.persistState();
  }
  
  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    console.error('[CircuitBreaker] Transitioning to CLOSED - service recovered');
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
    this.consecutiveFailures = 0;
    this.halfOpenCalls = 0;
    
    // Reset backoff delay on successful recovery
    this.backoffDelay = this.config.initialBackoffDelay;
    
    this.persistState();
  }
  
  /**
   * Clean up old failure and success records outside the monitoring window
   */
  private cleanupOldRecords(now: number): void {
    const cutoff = now - this.config.monitoringWindow;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
    this.successes = this.successes.filter(s => s.timestamp > cutoff);
  }
  
  /**
   * Update tool-specific statistics
   */
  private updateToolStats(
    toolName: string, 
    type: 'call' | 'success' | 'failure',
    duration?: number,
    errorType?: ErrorType
  ): void {
    if (!this.toolStats.has(toolName)) {
      this.toolStats.set(toolName, {
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        retriableFailures: 0,
        nonRetriableFailures: 0,
        averageResponseTime: 0,
        lastCallTime: 0,
        consecutiveFailures: 0,
        circuitBreakerTrips: 0
      });
    }
    
    const stats = this.toolStats.get(toolName)!;
    const now = Date.now();
    
    switch (type) {
      case 'call':
        stats.totalCalls++;
        stats.lastCallTime = now;
        break;
        
      case 'success':
        stats.successCount++;
        stats.consecutiveFailures = 0;
        if (duration !== undefined) {
          stats.averageResponseTime = (
            (stats.averageResponseTime * (stats.successCount - 1) + duration) / stats.successCount
          );
        }
        break;
        
      case 'failure':
        stats.failureCount++;
        stats.consecutiveFailures++;
        if (duration !== undefined) {
          // Include failure duration in average
          const totalResponses = stats.successCount + stats.failureCount;
          stats.averageResponseTime = (
            (stats.averageResponseTime * (totalResponses - 1) + duration) / totalResponses
          );
        }
        if (errorType) {
          const classification = ErrorClassifier.classifyError(new Error());
          if (classification.retriable) {
            stats.retriableFailures++;
          } else {
            stats.nonRetriableFailures++;
          }
        }
        break;
    }
  }
  
  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    this.cleanupOldRecords(now);
    
    const recentFailures = this.failures.filter(f => now - f.timestamp <= this.config.monitoringWindow);
    const recentSuccesses = this.successes.filter(s => now - s.timestamp <= this.config.monitoringWindow);
    const totalCalls = recentFailures.length + recentSuccesses.length;
    const failureRate = totalCalls > 0 ? recentFailures.length / totalCalls : 0;
    
    const metrics: CircuitBreakerMetrics = {
      state: this.state,
      failureRate,
      totalCalls,
      successCount: recentSuccesses.length,
      failureCount: recentFailures.length,
      consecutiveFailures: this.consecutiveFailures,
      timeInState: now - this.lastStateChange,
      lastStateChange: this.lastStateChange,
      backoffDelay: this.backoffDelay,
      halfOpenCalls: this.halfOpenCalls,
      toolStats: {}
    };
    
    // Add next retry time if in OPEN state
    if (this.state === 'OPEN') {
      metrics.nextRetryTime = this.lastStateChange + this.backoffDelay;
    }
    
    // Convert tool stats map to object
    this.toolStats.forEach((stats, toolName) => {
      metrics.toolStats[toolName] = { ...stats };
    });
    
    return metrics;
  }
  
  /**
   * Reset circuit breaker to CLOSED state
   */
  reset(): void {
    console.error('[CircuitBreaker] Manual reset - clearing all failure history');
    this.state = 'CLOSED';
    this.failures = [];
    this.successes = [];
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
    this.backoffDelay = this.config.initialBackoffDelay;
    this.halfOpenCalls = 0;
    this.persistState();
  }
  
  /**
   * Get failure analysis for debugging
   */
  getFailureAnalysis(): {
    recentFailures: FailureRecord[];
    errorTypeDistribution: Record<ErrorType, number>;
    retriableVsNonRetriable: { retriable: number; nonRetriable: number };
  } {
    const now = Date.now();
    const recentFailures = this.failures.filter(f => now - f.timestamp <= this.config.monitoringWindow);
    
    const errorTypeDistribution = {} as Record<ErrorType, number>;
    let retriableCount = 0;
    let nonRetriableCount = 0;
    
    recentFailures.forEach(failure => {
      errorTypeDistribution[failure.errorType] = (errorTypeDistribution[failure.errorType] || 0) + 1;
      if (failure.retriable) {
        retriableCount++;
      } else {
        nonRetriableCount++;
      }
    });
    
    return {
      recentFailures,
      errorTypeDistribution,
      retriableVsNonRetriable: { retriable: retriableCount, nonRetriable: nonRetriableCount }
    };
  }
  
  /**
   * Load persisted state from file
   */
  private loadPersistedState(): void {
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
        this.state = data.state || 'CLOSED';
        this.consecutiveFailures = data.consecutiveFailures || 0;
        this.lastFailureTime = data.lastFailureTime || 0;
        this.lastStateChange = data.lastStateChange || Date.now();
        this.backoffDelay = data.backoffDelay || this.config.initialBackoffDelay;
        
        // Don't restore failures/successes as they might be stale
        console.error(`[CircuitBreaker] Loaded persisted state: ${this.state}`);
      }
    } catch (error) {
      console.error('[CircuitBreaker] Failed to load persisted state:', error);
      // Continue with default state
    }
  }
  
  /**
   * Persist current state to file
   */
  private persistState(): void {
    try {
      const state = {
        state: this.state,
        consecutiveFailures: this.consecutiveFailures,
        lastFailureTime: this.lastFailureTime,
        lastStateChange: this.lastStateChange,
        backoffDelay: this.backoffDelay
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('[CircuitBreaker] Failed to persist state:', error);
    }
  }
}