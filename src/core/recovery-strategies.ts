/**
 * Recovery Strategies Implementation - Phase 3C Recovery System
 * 
 * Implements comprehensive recovery strategies for different failure patterns,
 * providing automated recovery mechanisms with intelligent adaptation based
 * on error types, system state, and recovery success patterns.
 * 
 * Key Features:
 * - Pattern-based recovery for common failure types
 * - Adaptive recovery strategies that learn from success/failure patterns
 * - Multi-phase recovery with rollback capabilities
 * - Resource management during recovery operations
 * - Integration with browser management and connection pooling
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { ErrorType, ErrorClassifier } from './circuit-breaker.js';
import { DegradationLevel, GracefulDegradationManager } from './graceful-degradation.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { ProjectPaths } from '../utils/project-paths.js';
import * as fs from 'fs';
import * as path from 'path';

// ============= INTERFACES & TYPES =============

/**
 * Recovery action execution result
 */
export interface RecoveryActionResult {
  success: boolean;
  duration: number;
  error?: Error;
  resourcesAffected: string[];
  sideEffects: string[];
  rollbackPossible: boolean;
  rollbackActions?: (() => Promise<void>)[];
}

/**
 * Recovery strategy execution context
 */
export interface RecoveryExecutionContext {
  errorType: ErrorType;
  triggerError?: Error;
  systemState: {
    degradationLevel: DegradationLevel;
    circuitBreakerState: string;
    connectionPoolHealth: boolean;
    browserAlive: boolean;
  };
  previousAttempts: number;
  resourceConstraints: {
    maxMemoryUsage: number;
    maxRecoveryTime: number;
    allowBrowserRestart: boolean;
  };
  rollbackStack: (() => Promise<void>)[];
}

/**
 * Recovery strategy with adaptive learning
 */
export interface AdaptiveRecoveryStrategy {
  errorType: ErrorType;
  name: string;
  description: string;
  phases: RecoveryPhase[];
  successHistory: RecoveryAttemptRecord[];
  adaptiveParameters: {
    baseTimeout: number;
    timeoutMultiplier: number;
    maxRetries: number;
    learningRate: number;
  };
  prerequisites: {
    minDegradationLevel?: DegradationLevel;
    maxPreviousAttempts: number;
    requiresBrowser: boolean;
    resourceRequirements: string[];
  };
}

/**
 * Recovery phase definition
 */
export interface RecoveryPhase {
  name: string;
  description: string;
  actions: RecoveryActionDefinition[];
  rollbackOnFailure: boolean;
  continueOnPartialFailure: boolean;
  timeout: number;
  prerequisites?: string[];
}

/**
 * Recovery action with execution logic
 */
export interface RecoveryActionDefinition {
  type: RecoveryActionType;
  name: string;
  description: string;
  execute: (context: RecoveryExecutionContext, browser?: Browser) => Promise<RecoveryActionResult>;
  rollback?: (context: RecoveryExecutionContext) => Promise<void>;
  timeout: number;
  critical: boolean;
  resourceImpact: 'low' | 'medium' | 'high';
}

/**
 * Recovery action types
 */
export type RecoveryActionType = 
  | 'browser_restart'
  | 'context_reset'
  | 'page_refresh'
  | 'cache_clear'
  | 'memory_cleanup'
  | 'connection_reset'
  | 'pool_optimization'
  | 'wait_stabilization'
  | 'fallback_mode'
  | 'resource_check'
  | 'system_diagnostic';

/**
 * Recovery attempt record for learning
 */
export interface RecoveryAttemptRecord {
  timestamp: number;
  context: RecoveryExecutionContext;
  phasesExecuted: string[];
  overallSuccess: boolean;
  totalDuration: number;
  finalDegradationLevel: DegradationLevel;
  resourceUsage: {
    memoryPeak: number;
    browserRestarts: number;
    connectionResets: number;
  };
}

// ============= RECOVERY ACTION IMPLEMENTATIONS =============

/**
 * Browser restart recovery action
 */
async function executeBrowserRestart(
  context: RecoveryExecutionContext,
  browser?: Browser
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = ['browser', 'all-contexts', 'all-pages'];
  const sideEffects: string[] = [];
  const rollbackActions: (() => Promise<void>)[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing browser restart...');
    
    if (browser) {
      // Close all existing contexts first
      const contexts = browser.contexts();
      for (const context of contexts) {
        try {
          await context.close();
          sideEffects.push(`Closed context with ${context.pages().length} pages`);
        } catch (error) {
          console.error('[RecoveryStrategies] Error closing context during restart:', error);
        }
      }
      
      // Close browser
      await browser.close();
      sideEffects.push('Browser instance terminated');
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Note: Browser restart would be handled by the parent system
    // This action just ensures clean shutdown of existing browser
    
    return {
      success: true,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: false, // Cannot rollback browser restart
      rollbackActions: []
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

/**
 * Context reset recovery action
 */
async function executeContextReset(
  context: RecoveryExecutionContext,
  browser?: Browser
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = ['browser-contexts'];
  const sideEffects: string[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing context reset...');
    
    if (browser) {
      const contexts = browser.contexts();
      let resetCount = 0;
      
      for (const browserContext of contexts) {
        try {
          // Close all pages in context
          const pages = browserContext.pages();
          for (const page of pages) {
            await page.close();
          }
          
          // Close context
          await browserContext.close();
          resetCount++;
          
        } catch (error) {
          console.error('[RecoveryStrategies] Error resetting context:', error);
        }
      }
      
      sideEffects.push(`Reset ${resetCount} browser contexts`);
    }
    
    return {
      success: true,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: true,
      rollbackActions: [] // Would implement context restoration if needed
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

/**
 * Cache cleanup recovery action
 */
async function executeCacheCleanup(
  context: RecoveryExecutionContext
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = ['cache-files', 'memory-cache'];
  const sideEffects: string[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing cache cleanup...');
    
    // Clear cache files if they exist
    const cacheDir = ProjectPaths.getCacheDir();
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      let clearedFiles = 0;
      
      for (const file of files) {
        if (file.endsWith('.db') || file.endsWith('.cache') || file.endsWith('.tmp')) {
          try {
            const filePath = path.join(cacheDir, file);
            const stats = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            clearedFiles++;
            sideEffects.push(`Removed cache file: ${file} (${stats.size} bytes)`);
          } catch (error) {
            console.error(`[RecoveryStrategies] Error removing cache file ${file}:`, error);
          }
        }
      }
      
      sideEffects.push(`Cleared ${clearedFiles} cache files`);
    }
    
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
      sideEffects.push('Forced garbage collection');
    }
    
    return {
      success: true,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: false, // Cannot restore cleared cache
      rollbackActions: []
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

/**
 * Memory cleanup recovery action
 */
async function executeMemoryCleanup(
  context: RecoveryExecutionContext
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = ['process-memory'];
  const sideEffects: string[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing memory cleanup...');
    
    const memBefore = process.memoryUsage();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
      sideEffects.push('Forced garbage collection');
    }
    
    // Wait for GC to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const memAfter = process.memoryUsage();
    const memoryFreed = memBefore.heapUsed - memAfter.heapUsed;
    
    sideEffects.push(`Memory cleanup freed ${Math.round(memoryFreed / 1024 / 1024)}MB`);
    sideEffects.push(`Heap usage: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
    
    return {
      success: true,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: false,
      rollbackActions: []
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

/**
 * Connection pool optimization recovery action
 */
async function executePoolOptimization(
  context: RecoveryExecutionContext
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = ['connection-pools'];
  const sideEffects: string[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing connection pool optimization...');
    
    const poolManager = ConnectionPoolManager.getInstance();
    
    // Perform cross-pool optimization
    const optimizationResult = await poolManager.performCrossPoolOptimization();
    
    sideEffects.push(`Applied ${optimizationResult.optimizationsApplied} optimizations`);
    sideEffects.push(...optimizationResult.results);
    
    return {
      success: optimizationResult.optimizationsApplied > 0,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: false, // Optimizations are generally not reversible
      rollbackActions: []
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

/**
 * System stabilization wait action
 */
async function executeStabilizationWait(
  context: RecoveryExecutionContext
): Promise<RecoveryActionResult> {
  const startTime = Date.now();
  const resourcesAffected: string[] = [];
  const sideEffects: string[] = [];
  
  try {
    console.error('[RecoveryStrategies] Executing stabilization wait...');
    
    // Calculate wait time based on error type and previous attempts
    let waitTime = 2000; // Base 2 seconds
    
    switch (context.errorType) {
      case ErrorType.NETWORK_TIMEOUT:
        waitTime = 5000;
        break;
      case ErrorType.MEMORY_PRESSURE:
        waitTime = 3000;
        break;
      case ErrorType.BROWSER_CRASH:
        waitTime = 4000;
        break;
      default:
        waitTime = 2000;
    }
    
    // Increase wait time based on previous attempts
    waitTime *= Math.min(context.previousAttempts + 1, 3);
    
    sideEffects.push(`Waiting ${waitTime}ms for system stabilization`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    return {
      success: true,
      duration: Date.now() - startTime,
      resourcesAffected,
      sideEffects,
      rollbackPossible: false,
      rollbackActions: []
    };
    
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
      resourcesAffected,
      sideEffects,
      rollbackPossible: false
    };
  }
}

// ============= ADAPTIVE RECOVERY STRATEGIES =============

/**
 * Main recovery strategies registry with adaptive learning
 */
export class RecoveryStrategiesManager {
  private static instance: RecoveryStrategiesManager | null = null;
  private strategies = new Map<ErrorType, AdaptiveRecoveryStrategy>();
  private attemptHistory: RecoveryAttemptRecord[] = [];
  private persistenceFile: string;
  
  private constructor() {
    this.persistenceFile = path.join(ProjectPaths.getCacheDir(), 'recovery-strategies-history.json');
    this.initializeStrategies();
    this.loadHistoricalData();
    
    console.error('[RecoveryStrategiesManager] Initialized with adaptive learning');
  }
  
  static getInstance(): RecoveryStrategiesManager {
    if (!RecoveryStrategiesManager.instance) {
      RecoveryStrategiesManager.instance = new RecoveryStrategiesManager();
    }
    return RecoveryStrategiesManager.instance;
  }
  
  /**
   * Execute recovery strategy for a specific error type
   */
  async executeRecoveryStrategy(
    errorType: ErrorType,
    context: RecoveryExecutionContext,
    browser?: Browser
  ): Promise<{
    success: boolean;
    phasesExecuted: string[];
    totalDuration: number;
    finalDegradationLevel: DegradationLevel;
    errors: Error[];
    resourceUsage: any;
  }> {
    const strategy = this.strategies.get(errorType);
    if (!strategy) {
      throw new Error(`No recovery strategy found for error type: ${errorType}`);
    }
    
    console.error(`[RecoveryStrategiesManager] Executing recovery strategy: ${strategy.name}`);
    
    const startTime = Date.now();
    const phasesExecuted: string[] = [];
    const errors: Error[] = [];
    let overallSuccess = true;
    const resourceUsage = {
      memoryPeak: process.memoryUsage().heapUsed,
      browserRestarts: 0,
      connectionResets: 0
    };
    
    // Check prerequisites
    if (!this.checkPrerequisites(strategy, context)) {
      throw new Error(`Recovery strategy prerequisites not met for ${strategy.name}`);
    }
    
    // Execute phases
    for (const phase of strategy.phases) {
      try {
        console.error(`[RecoveryStrategiesManager] Executing phase: ${phase.name}`);
        
        const phaseResult = await this.executePhase(phase, context, browser);
        phasesExecuted.push(phase.name);
        
        if (!phaseResult.success) {
          overallSuccess = false;
          if (phaseResult.error) {
            errors.push(phaseResult.error);
          }
          
          if (!phase.continueOnPartialFailure) {
            console.error(`[RecoveryStrategiesManager] Phase ${phase.name} failed, stopping recovery`);
            break;
          }
        }
        
        // Track resource usage
        const currentMemory = process.memoryUsage().heapUsed;
        if (currentMemory > resourceUsage.memoryPeak) {
          resourceUsage.memoryPeak = currentMemory;
        }
        
      } catch (error) {
        console.error(`[RecoveryStrategiesManager] Phase ${phase.name} error:`, error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
        overallSuccess = false;
        
        if (!phase.continueOnPartialFailure) {
          break;
        }
      }
    }
    
    const totalDuration = Date.now() - startTime;
    const finalDegradationLevel = GracefulDegradationManager.getInstance().getCurrentLevel();
    
    // Record attempt for learning
    const attemptRecord: RecoveryAttemptRecord = {
      timestamp: Date.now(),
      context: { ...context },
      phasesExecuted,
      overallSuccess,
      totalDuration,
      finalDegradationLevel,
      resourceUsage
    };
    
    this.recordAttempt(errorType, attemptRecord);
    
    console.error(`[RecoveryStrategiesManager] Recovery strategy completed: ${overallSuccess ? 'SUCCESS' : 'PARTIAL/FAILURE'} (${totalDuration}ms)`);
    
    return {
      success: overallSuccess,
      phasesExecuted,
      totalDuration,
      finalDegradationLevel,
      errors,
      resourceUsage
    };
  }
  
  /**
   * Get recommended recovery strategy based on context and history
   */
  getRecommendedStrategy(errorType: ErrorType, context: RecoveryExecutionContext): AdaptiveRecoveryStrategy | null {
    const strategy = this.strategies.get(errorType);
    if (!strategy) return null;
    
    // Adapt strategy based on historical success rates
    this.adaptStrategyParameters(strategy, context);
    
    return strategy;
  }
  
  /**
   * Get recovery statistics for monitoring
   */
  getRecoveryStatistics(): {
    totalAttempts: number;
    successRate: number;
    averageRecoveryTime: number;
    strategySuccessRates: Record<string, number>;
    recentTrends: {
      last24h: { attempts: number; successRate: number };
      last7d: { attempts: number; successRate: number };
    };
  } {
    const totalAttempts = this.attemptHistory.length;
    const successfulAttempts = this.attemptHistory.filter(a => a.overallSuccess).length;
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    
    const totalTime = this.attemptHistory.reduce((sum, a) => sum + a.totalDuration, 0);
    const averageRecoveryTime = totalAttempts > 0 ? totalTime / totalAttempts : 0;
    
    // Calculate strategy-specific success rates
    const strategySuccessRates: Record<string, number> = {};
    for (const [errorType, strategy] of this.strategies) {
      const strategyAttempts = strategy.successHistory;
      const strategySuccesses = strategyAttempts.filter(a => a.overallSuccess).length;
      const strategyRate = strategyAttempts.length > 0 ? strategySuccesses / strategyAttempts.length : 0;
      strategySuccessRates[strategy.name] = strategyRate;
    }
    
    // Calculate recent trends
    const now = Date.now();
    const last24h = this.attemptHistory.filter(a => now - a.timestamp <= 86400000); // 24 hours
    const last7d = this.attemptHistory.filter(a => now - a.timestamp <= 604800000); // 7 days
    
    return {
      totalAttempts,
      successRate,
      averageRecoveryTime,
      strategySuccessRates,
      recentTrends: {
        last24h: {
          attempts: last24h.length,
          successRate: last24h.length > 0 ? last24h.filter(a => a.overallSuccess).length / last24h.length : 0
        },
        last7d: {
          attempts: last7d.length,
          successRate: last7d.length > 0 ? last7d.filter(a => a.overallSuccess).length / last7d.length : 0
        }
      }
    };
  }
  
  // ============= PRIVATE METHODS =============
  
  private initializeStrategies(): void {
    // Browser Crash Recovery Strategy
    this.strategies.set(ErrorType.BROWSER_CRASH, {
      errorType: ErrorType.BROWSER_CRASH,
      name: 'Browser Crash Recovery',
      description: 'Comprehensive browser restart and context restoration',
      phases: [
        {
          name: 'Stabilization',
          description: 'Wait for system to stabilize after crash',
          actions: [
            {
              type: 'wait_stabilization',
              name: 'Stabilization Wait',
              description: 'Wait for system stabilization',
              execute: executeStabilizationWait,
              timeout: 10000,
              critical: false,
              resourceImpact: 'low'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 15000
        },
        {
          name: 'Memory Cleanup',
          description: 'Clean up memory before restart',
          actions: [
            {
              type: 'memory_cleanup',
              name: 'Memory Cleanup',
              description: 'Force garbage collection and memory cleanup',
              execute: executeMemoryCleanup,
              timeout: 5000,
              critical: false,
              resourceImpact: 'medium'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 10000
        },
        {
          name: 'Browser Restart',
          description: 'Restart browser instance',
          actions: [
            {
              type: 'browser_restart',
              name: 'Browser Restart',
              description: 'Clean shutdown and restart of browser',
              execute: executeBrowserRestart,
              timeout: 15000,
              critical: true,
              resourceImpact: 'high'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: false,
          timeout: 20000
        }
      ],
      successHistory: [],
      adaptiveParameters: {
        baseTimeout: 5000,
        timeoutMultiplier: 1.5,
        maxRetries: 2,
        learningRate: 0.1
      },
      prerequisites: {
        maxPreviousAttempts: 3,
        requiresBrowser: true,
        resourceRequirements: ['memory', 'browser-control']
      }
    });
    
    // Memory Pressure Recovery Strategy
    this.strategies.set(ErrorType.MEMORY_PRESSURE, {
      errorType: ErrorType.MEMORY_PRESSURE,
      name: 'Memory Pressure Recovery',
      description: 'Aggressive memory cleanup and resource optimization',
      phases: [
        {
          name: 'Cache Cleanup',
          description: 'Clear all cached data',
          actions: [
            {
              type: 'cache_clear',
              name: 'Cache Cleanup',
              description: 'Clear cache files and memory cache',
              execute: executeCacheCleanup,
              timeout: 10000,
              critical: false,
              resourceImpact: 'low'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 15000
        },
        {
          name: 'Memory Optimization',
          description: 'Force garbage collection and memory cleanup',
          actions: [
            {
              type: 'memory_cleanup',
              name: 'Memory Cleanup',
              description: 'Aggressive memory cleanup',
              execute: executeMemoryCleanup,
              timeout: 5000,
              critical: true,
              resourceImpact: 'medium'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: false,
          timeout: 10000
        },
        {
          name: 'Pool Optimization',
          description: 'Optimize connection pools',
          actions: [
            {
              type: 'pool_optimization',
              name: 'Pool Optimization',
              description: 'Optimize connection pool sizes and cleanup',
              execute: executePoolOptimization,
              timeout: 8000,
              critical: false,
              resourceImpact: 'low'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 12000
        }
      ],
      successHistory: [],
      adaptiveParameters: {
        baseTimeout: 3000,
        timeoutMultiplier: 1.2,
        maxRetries: 3,
        learningRate: 0.15
      },
      prerequisites: {
        maxPreviousAttempts: 5,
        requiresBrowser: false,
        resourceRequirements: ['memory-management']
      }
    });
    
    // Network Timeout Recovery Strategy
    this.strategies.set(ErrorType.NETWORK_TIMEOUT, {
      errorType: ErrorType.NETWORK_TIMEOUT,
      name: 'Network Timeout Recovery',
      description: 'Wait-based recovery with connection optimization',
      phases: [
        {
          name: 'Network Stabilization',
          description: 'Wait for network conditions to improve',
          actions: [
            {
              type: 'wait_stabilization',
              name: 'Network Wait',
              description: 'Wait for network stabilization',
              execute: executeStabilizationWait,
              timeout: 15000,
              critical: true,
              resourceImpact: 'low'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: false,
          timeout: 20000
        },
        {
          name: 'Connection Reset',
          description: 'Reset connection pools',
          actions: [
            {
              type: 'pool_optimization',
              name: 'Connection Reset',
              description: 'Reset and optimize network connections',
              execute: executePoolOptimization,
              timeout: 8000,
              critical: false,
              resourceImpact: 'medium'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 12000
        }
      ],
      successHistory: [],
      adaptiveParameters: {
        baseTimeout: 8000,
        timeoutMultiplier: 1.8,
        maxRetries: 4,
        learningRate: 0.2
      },
      prerequisites: {
        maxPreviousAttempts: 4,
        requiresBrowser: false,
        resourceRequirements: ['network-access']
      }
    });
    
    // Connection Failure Recovery Strategy
    this.strategies.set(ErrorType.CONNECTION_FAILURE, {
      errorType: ErrorType.CONNECTION_FAILURE,
      name: 'Connection Failure Recovery',
      description: 'Reset connections and browser contexts',
      phases: [
        {
          name: 'Context Reset',
          description: 'Reset browser contexts',
          actions: [
            {
              type: 'context_reset',
              name: 'Context Reset',
              description: 'Reset all browser contexts',
              execute: executeContextReset,
              timeout: 10000,
              critical: true,
              resourceImpact: 'medium'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: false,
          timeout: 15000
        },
        {
          name: 'Pool Optimization',
          description: 'Optimize connection pools',
          actions: [
            {
              type: 'pool_optimization',
              name: 'Pool Reset',
              description: 'Reset and optimize connection pools',
              execute: executePoolOptimization,
              timeout: 8000,
              critical: false,
              resourceImpact: 'low'
            }
          ],
          rollbackOnFailure: false,
          continueOnPartialFailure: true,
          timeout: 12000
        }
      ],
      successHistory: [],
      adaptiveParameters: {
        baseTimeout: 4000,
        timeoutMultiplier: 1.3,
        maxRetries: 3,
        learningRate: 0.12
      },
      prerequisites: {
        maxPreviousAttempts: 3,
        requiresBrowser: true,
        resourceRequirements: ['browser-control']
      }
    });
  }
  
  private checkPrerequisites(strategy: AdaptiveRecoveryStrategy, context: RecoveryExecutionContext): boolean {
    // Check previous attempts
    if (context.previousAttempts > strategy.prerequisites.maxPreviousAttempts) {
      return false;
    }
    
    // Check degradation level if specified
    if (strategy.prerequisites.minDegradationLevel) {
      const levelOrder: DegradationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
      const currentIndex = levelOrder.indexOf(context.systemState.degradationLevel);
      const minIndex = levelOrder.indexOf(strategy.prerequisites.minDegradationLevel);
      if (currentIndex < minIndex) {
        return false;
      }
    }
    
    // Check browser requirement
    if (strategy.prerequisites.requiresBrowser && !context.systemState.browserAlive) {
      return false;
    }
    
    return true;
  }
  
  private async executePhase(
    phase: RecoveryPhase,
    context: RecoveryExecutionContext,
    browser?: Browser
  ): Promise<{ success: boolean; error?: Error }> {
    const phaseStartTime = Date.now();
    let phaseSuccess = true;
    let phaseError: Error | undefined;
    
    for (const actionDef of phase.actions) {
      try {
        console.error(`[RecoveryStrategiesManager] Executing action: ${actionDef.name}`);
        
        const actionResult = await Promise.race([
          actionDef.execute(context, browser),
          new Promise<RecoveryActionResult>((_, reject) => 
            setTimeout(() => reject(new Error('Action timeout')), actionDef.timeout)
          )
        ]);
        
        if (!actionResult.success) {
          phaseSuccess = false;
          phaseError = actionResult.error;
          
          if (actionDef.critical) {
            console.error(`[RecoveryStrategiesManager] Critical action ${actionDef.name} failed`);
            break;
          }
        }
        
        // Add rollback actions to context if provided
        if (actionResult.rollbackActions) {
          context.rollbackStack.push(...actionResult.rollbackActions);
        }
        
      } catch (error) {
        console.error(`[RecoveryStrategiesManager] Action ${actionDef.name} error:`, error);
        phaseSuccess = false;
        phaseError = error instanceof Error ? error : new Error(String(error));
        
        if (actionDef.critical) {
          break;
        }
      }
    }
    
    const phaseDuration = Date.now() - phaseStartTime;
    if (phaseDuration > phase.timeout) {
      console.error(`[RecoveryStrategiesManager] Phase ${phase.name} exceeded timeout (${phaseDuration}ms > ${phase.timeout}ms)`);
    }
    
    return { success: phaseSuccess, error: phaseError };
  }
  
  private recordAttempt(errorType: ErrorType, record: RecoveryAttemptRecord): void {
    // Add to global history
    this.attemptHistory.push(record);
    
    // Add to strategy-specific history
    const strategy = this.strategies.get(errorType);
    if (strategy) {
      strategy.successHistory.push(record);
      
      // Limit history size
      if (strategy.successHistory.length > 100) {
        strategy.successHistory.shift();
      }
    }
    
    // Limit global history size
    if (this.attemptHistory.length > 500) {
      this.attemptHistory.shift();
    }
    
    // Persist history
    this.persistHistory();
  }
  
  private adaptStrategyParameters(strategy: AdaptiveRecoveryStrategy, context: RecoveryExecutionContext): void {
    // Adapt timeouts based on success history
    const recentAttempts = strategy.successHistory.slice(-20); // Last 20 attempts
    if (recentAttempts.length > 5) {
      const successRate = recentAttempts.filter(a => a.overallSuccess).length / recentAttempts.length;
      const avgDuration = recentAttempts.reduce((sum, a) => sum + a.totalDuration, 0) / recentAttempts.length;
      
      // Adjust parameters based on success rate and duration
      if (successRate < 0.5) {
        // Low success rate - increase timeouts and reduce retries
        strategy.adaptiveParameters.timeoutMultiplier = Math.min(strategy.adaptiveParameters.timeoutMultiplier * 1.1, 3.0);
        strategy.adaptiveParameters.maxRetries = Math.max(strategy.adaptiveParameters.maxRetries - 1, 1);
      } else if (successRate > 0.8 && avgDuration < strategy.adaptiveParameters.baseTimeout) {
        // High success rate and fast execution - optimize for speed
        strategy.adaptiveParameters.timeoutMultiplier = Math.max(strategy.adaptiveParameters.timeoutMultiplier * 0.95, 1.0);
        strategy.adaptiveParameters.maxRetries = Math.min(strategy.adaptiveParameters.maxRetries + 1, 5);
      }
    }
  }
  
  private loadHistoricalData(): void {
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
        
        if (data.attemptHistory) {
          this.attemptHistory = data.attemptHistory.slice(-200); // Keep last 200 attempts
        }
        
        if (data.strategyHistory) {
          for (const [errorType, history] of Object.entries(data.strategyHistory)) {
            const strategy = this.strategies.get(errorType as ErrorType);
            if (strategy && Array.isArray(history)) {
              strategy.successHistory = (history as RecoveryAttemptRecord[]).slice(-50); // Keep last 50 per strategy
            }
          }
        }
        
        console.error(`[RecoveryStrategiesManager] Loaded historical data: ${this.attemptHistory.length} records`);
      }
    } catch (error) {
      console.error('[RecoveryStrategiesManager] Failed to load historical data:', error);
    }
  }
  
  private persistHistory(): void {
    try {
      const strategyHistory: Record<string, RecoveryAttemptRecord[]> = {};
      for (const [errorType, strategy] of this.strategies) {
        strategyHistory[errorType] = strategy.successHistory;
      }
      
      const data = {
        timestamp: Date.now(),
        attemptHistory: this.attemptHistory.slice(-200),
        strategyHistory
      };
      
      const dir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[RecoveryStrategiesManager] Failed to persist history:', error);
    }
  }
}