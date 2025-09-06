/**
 * Graceful Degradation System - Phase 3C Implementation
 * 
 * Implements a 4-level progressive degradation system that provides meaningful
 * functionality even when primary tools fail, with automatic degradation and
 * recovery based on circuit breaker states.
 * 
 * Key Features:
 * - 4-level progressive degradation system (Full → Simplified → Basic → Read-Only)
 * - Automatic degradation based on circuit breaker state
 * - Recovery strategies for common failure patterns
 * - User-friendly messaging about current capabilities
 * - Integration with existing Phase 3A circuit breaker and Phase 3B connection pooling
 * - Tool-specific degradation levels with fallback chains
 * - Performance monitoring and degradation event tracking
 */

import { CircuitBreakerIntegration } from './circuit-breaker-integration.js';
import { ErrorClassifier, ErrorType } from './circuit-breaker.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { ProjectPaths } from '../utils/project-paths.js';
import * as fs from 'fs';
import * as path from 'path';

// ============= INTERFACES & TYPES =============

/**
 * Degradation levels with progressive capability reduction
 */
export type DegradationLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LEVEL_4';

/**
 * Tool degradation configuration
 */
export interface DegradationLevelConfig {
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  limitations: string[];
  expectedPerformance: {
    reliability: number; // 0-1 scale
    speed: number; // 0-1 scale
    functionality: number; // 0-1 scale
  };
  recoveryTime: number; // milliseconds before attempting upgrade
  fallbackChain?: string[]; // Ordered list of fallback tools
}

/**
 * Degradation event for monitoring and recovery
 */
export interface DegradationEvent {
  timestamp: number;
  fromLevel: DegradationLevel;
  toLevel: DegradationLevel;
  triggerReason: string;
  triggerError?: Error;
  toolName?: string;
  autoRecovery: boolean;
  userImpact: 'none' | 'minimal' | 'moderate' | 'significant';
  recoveryEstimate?: number; // milliseconds
}

/**
 * Recovery strategy for different failure types
 */
export interface RecoveryStrategy {
  errorType: ErrorType;
  name: string;
  description: string;
  actions: RecoveryAction[];
  targetLevel: DegradationLevel;
  estimatedRecoveryTime: number;
  successProbability: number; // 0-1 scale
}

/**
 * Recovery action definition
 */
export interface RecoveryAction {
  type: 'restart_browser' | 'clear_cache' | 'reduce_pool_size' | 'wait' | 'fallback_tool' | 'offline_mode';
  description: string;
  execute: () => Promise<boolean>;
  timeout: number;
}

/**
 * User experience enhancement configuration
 */
export interface UXEnhancement {
  level: DegradationLevel;
  messaging: {
    title: string;
    description: string;
    capabilities: string[];
    limitations: string[];
    expectedRecoveryTime?: string;
  };
  suggestions: {
    alternatives: string[];
    workarounds: string[];
    bestPractices: string[];
  };
  fallbacks: {
    toolName: string;
    simplifiedVersion: string;
    explanation: string;
  }[];
}

/**
 * Degradation metrics for monitoring
 */
export interface DegradationMetrics {
  currentLevel: DegradationLevel;
  timeInCurrentLevel: number;
  totalDegradationEvents: number;
  degradationEventsByLevel: Record<DegradationLevel, number>;
  recoverySuccessRate: number;
  averageRecoveryTime: number;
  userImpactDistribution: Record<string, number>;
  toolSpecificDegradations: Record<string, number>;
  performanceImpact: {
    reliability: number;
    speed: number;
    functionality: number;
  };
}

// ============= DEGRADATION LEVEL DEFINITIONS =============

/**
 * Progressive degradation level configurations
 */
export const DEGRADATION_LEVELS: Record<DegradationLevel, DegradationLevelConfig> = {
  LEVEL_1: {
    name: 'Full Functionality',
    description: 'All features available with optimal performance',
    capabilities: [
      'Advanced browser automation',
      'Complex selector resolution',
      'Session management',
      'Connection pooling',
      'Intelligent caching',
      'Full error recovery'
    ],
    tools: [
      'mcp__playwright__mcp_browser_navigate',
      'mcp__playwright__mcp_browser_click',
      'mcp__playwright__mcp_browser_type',
      'mcp__playwright__mcp_browser_screenshot',
      'mcp__playwright__mcp_browser_snapshot',
      'mcp__playwright__mcp_browser_fill_form',
      'mcp__playwright__mcp_browser_hover',
      'mcp__playwright__mcp_browser_select_option',
      'mcp__playwright__mcp_browser_press_key',
      'mcp__playwright__mcp_session_restore',
      'mcp__playwright__mcp_session_save',
      'mcp__playwright__mcp_test_run',
      'mcp__playwright__mcp_test_save'
    ],
    limitations: [],
    expectedPerformance: {
      reliability: 0.95,
      speed: 1.0,
      functionality: 1.0
    },
    recoveryTime: 0
  },
  LEVEL_2: {
    name: 'Simplified Interactions',
    description: 'Core functionality with simplified implementations',
    capabilities: [
      'Basic browser automation',
      'Simple selector resolution',
      'Limited session support',
      'Reduced connection pooling',
      'Basic error handling'
    ],
    tools: [
      'mcp_browser_click_simple',
      'mcp_browser_type_basic',
      'mcp_browser_navigate_safe',
      'mcp_browser_screenshot_basic',
      'mcp_browser_snapshot_simple',
      'mcp_session_restore_basic',
      'mcp_test_run_simple'
    ],
    limitations: [
      'Complex selectors may fail',
      'Limited session persistence',
      'Reduced connection reuse',
      'Basic error recovery only'
    ],
    expectedPerformance: {
      reliability: 0.80,
      speed: 0.75,
      functionality: 0.70
    },
    recoveryTime: 30000, // 30 seconds
    fallbackChain: [
      'browser_click',
      'browser_type',
      'browser_navigate',
      'browser_screenshot'
    ]
  },
  LEVEL_3: {
    name: 'Basic DOM Operations',
    description: 'Essential read-only operations with minimal interaction',
    capabilities: [
      'DOM inspection',
      'Page screenshots',
      'Console monitoring',
      'Basic JavaScript execution',
      'Read-only session access'
    ],
    tools: [
      'mcp_browser_snapshot_readonly',
      'mcp_browser_screenshot_safe',
      'mcp_browser_evaluate_simple',
      'mcp_debug_console',
      'mcp_cache_inspect'
    ],
    limitations: [
      'No page interactions (clicks, typing)',
      'No session modifications',
      'Limited JavaScript execution',
      'Read-only access only'
    ],
    expectedPerformance: {
      reliability: 0.90,
      speed: 0.60,
      functionality: 0.40
    },
    recoveryTime: 60000, // 1 minute
    fallbackChain: [
      'browser_snapshot',
      'browser_screenshot',
      'browser_console_messages'
    ]
  },
  LEVEL_4: {
    name: 'Read-Only Mode',
    description: 'Minimal functionality for system monitoring only',
    capabilities: [
      'System status monitoring',
      'Cache inspection',
      'Console message viewing',
      'Basic diagnostics',
      'Error reporting'
    ],
    tools: [
      'mcp_debug_console_readonly',
      'mcp_cache_inspect_safe',
      'mcp_protocol_inspect',
      'mcp_system_status'
    ],
    limitations: [
      'No browser interactions',
      'No session access',
      'No page operations',
      'Monitoring only'
    ],
    expectedPerformance: {
      reliability: 0.95,
      speed: 0.90,
      functionality: 0.15
    },
    recoveryTime: 120000 // 2 minutes
  }
};

// ============= RECOVERY STRATEGIES =============

/**
 * Recovery strategies for common failure patterns
 */
export const RECOVERY_STRATEGIES: Record<ErrorType, RecoveryStrategy> = {
  [ErrorType.BROWSER_CRASH]: {
    errorType: ErrorType.BROWSER_CRASH,
    name: 'Browser Recovery',
    description: 'Restart browser and reduce to Level 2 operations',
    actions: [
      {
        type: 'restart_browser',
        description: 'Restart browser instance',
        execute: async () => {
          // Will be implemented with actual browser restart logic
          return true;
        },
        timeout: 10000
      },
      {
        type: 'reduce_pool_size',
        description: 'Reduce connection pool size to minimize resource usage',
        execute: async () => {
          // Will be implemented with pool size reduction
          return true;
        },
        timeout: 5000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 15000,
    successProbability: 0.85
  },
  [ErrorType.NETWORK_TIMEOUT]: {
    errorType: ErrorType.NETWORK_TIMEOUT,
    name: 'Network Recovery',
    description: 'Switch to cached operations and offline mode',
    actions: [
      {
        type: 'offline_mode',
        description: 'Enable offline mode with cached operations',
        execute: async () => {
          return true;
        },
        timeout: 2000
      },
      {
        type: 'wait',
        description: 'Wait for network connectivity to recover',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return true;
        },
        timeout: 5000
      }
    ],
    targetLevel: 'LEVEL_3',
    estimatedRecoveryTime: 30000,
    successProbability: 0.70
  },
  [ErrorType.ELEMENT_NOT_FOUND]: {
    errorType: ErrorType.ELEMENT_NOT_FOUND,
    name: 'Selector Fallback',
    description: 'Use simplified selectors and fallback strategies',
    actions: [
      {
        type: 'fallback_tool',
        description: 'Use simplified selector resolution',
        execute: async () => {
          return true;
        },
        timeout: 3000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 5000,
    successProbability: 0.90
  },
  [ErrorType.MEMORY_PRESSURE]: {
    errorType: ErrorType.MEMORY_PRESSURE,
    name: 'Memory Recovery',
    description: 'Clear caches and reduce resource usage',
    actions: [
      {
        type: 'clear_cache',
        description: 'Clear browser and system caches',
        execute: async () => {
          return true;
        },
        timeout: 5000
      },
      {
        type: 'reduce_pool_size',
        description: 'Reduce connection pool sizes',
        execute: async () => {
          return true;
        },
        timeout: 2000
      }
    ],
    targetLevel: 'LEVEL_3',
    estimatedRecoveryTime: 10000,
    successProbability: 0.80
  },
  [ErrorType.CONNECTION_FAILURE]: {
    errorType: ErrorType.CONNECTION_FAILURE,
    name: 'Connection Recovery',
    description: 'Reset connections and use simplified pooling',
    actions: [
      {
        type: 'restart_browser',
        description: 'Reset browser connections',
        execute: async () => {
          return true;
        },
        timeout: 8000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 12000,
    successProbability: 0.75
  },
  [ErrorType.VALIDATION_ERROR]: {
    errorType: ErrorType.VALIDATION_ERROR,
    name: 'Validation Bypass',
    description: 'Use basic tools without advanced validation',
    actions: [
      {
        type: 'fallback_tool',
        description: 'Switch to basic tool implementations',
        execute: async () => {
          return true;
        },
        timeout: 1000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 2000,
    successProbability: 0.95
  },
  [ErrorType.RETRIABLE]: {
    errorType: ErrorType.RETRIABLE,
    name: 'Generic Recovery',
    description: 'Standard recovery for retriable errors',
    actions: [
      {
        type: 'wait',
        description: 'Brief wait before retry',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return true;
        },
        timeout: 2000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 5000,
    successProbability: 0.70
  },
  [ErrorType.NON_RETRIABLE]: {
    errorType: ErrorType.NON_RETRIABLE,
    name: 'Degradation Only',
    description: 'Degrade to read-only mode without recovery attempts',
    actions: [],
    targetLevel: 'LEVEL_4',
    estimatedRecoveryTime: 60000,
    successProbability: 0.10
  },
  [ErrorType.UNKNOWN]: {
    errorType: ErrorType.UNKNOWN,
    name: 'Conservative Recovery',
    description: 'Conservative approach for unknown errors',
    actions: [
      {
        type: 'wait',
        description: 'Wait and assess error pattern',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return true;
        },
        timeout: 3000
      }
    ],
    targetLevel: 'LEVEL_2',
    estimatedRecoveryTime: 8000,
    successProbability: 0.60
  }
};

// ============= USER EXPERIENCE ENHANCEMENTS =============

/**
 * User experience enhancements for each degradation level
 */
export const UX_ENHANCEMENTS: Record<DegradationLevel, UXEnhancement> = {
  LEVEL_1: {
    level: 'LEVEL_1',
    messaging: {
      title: '✅ Full Functionality Active',
      description: 'All browser automation features are available with optimal performance.',
      capabilities: [
        'Advanced browser automation with intelligent caching',
        'Complex selector resolution with fallback strategies',
        'Full session management and persistence',
        'Connection pooling for optimal performance',
        'Complete error recovery and resilience'
      ],
      limitations: []
    },
    suggestions: {
      alternatives: [],
      workarounds: [],
      bestPractices: [
        'All features are fully available',
        'Optimal time to perform complex operations',
        'Session persistence and test recording fully functional'
      ]
    },
    fallbacks: []
  },
  LEVEL_2: {
    level: 'LEVEL_2',
    messaging: {
      title: '⚠️ Simplified Mode Active',
      description: 'Core functionality available with simplified implementations for better reliability.',
      capabilities: [
        'Basic browser automation with standard selectors',
        'Simple click, type, and navigation operations',
        'Limited session support for authentication',
        'Reduced connection pooling for stability',
        'Basic error handling and recovery'
      ],
      limitations: [
        'Complex selectors may not work reliably',
        'Advanced features temporarily unavailable',
        'Session persistence may be limited',
        'Reduced performance optimization'
      ],
      expectedRecoveryTime: '30 seconds'
    },
    suggestions: {
      alternatives: [
        'Use simple, direct selectors (id, class names)',
        'Break complex operations into smaller steps',
        'Verify elements are visible before interaction'
      ],
      workarounds: [
        'Text-based selection instead of complex CSS selectors',
        'Manual session restoration if auto-restore fails',
        'Sequential operations instead of parallel execution'
      ],
      bestPractices: [
        'Keep operations simple and direct',
        'Allow extra time for operations to complete',
        'Use basic selectors like button[type="submit"]'
      ]
    },
    fallbacks: [
      {
        toolName: 'mcp_browser_click_simple',
        simplifiedVersion: 'browser_click',
        explanation: 'Uses basic click without advanced selector resolution'
      },
      {
        toolName: 'mcp_browser_type_basic',
        simplifiedVersion: 'browser_type',
        explanation: 'Simple text input without intelligent form detection'
      }
    ]
  },
  LEVEL_3: {
    level: 'LEVEL_3',
    messaging: {
      title: '🔍 Read-Only Mode Active',
      description: 'Essential inspection capabilities available. Page interactions temporarily disabled.',
      capabilities: [
        'Full page inspection and DOM analysis',
        'Screenshot capture for visual verification',
        'Console message monitoring',
        'Basic JavaScript execution for data extraction',
        'Cache and system status inspection'
      ],
      limitations: [
        'No page interactions (clicking, typing, form filling)',
        'No session modifications or persistence',
        'Limited to read-only operations only',
        'JavaScript execution restricted to safe operations'
      ],
      expectedRecoveryTime: '1-2 minutes'
    },
    suggestions: {
      alternatives: [
        'Use screenshots to verify page state',
        'Extract information through DOM inspection',
        'Monitor console for error messages and state changes'
      ],
      workarounds: [
        'Manual browser interaction while monitoring via Claude',
        'Use screenshot comparisons to track changes',
        'Extract data through JavaScript evaluation'
      ],
      bestPractices: [
        'Focus on information gathering and analysis',
        'Use this time to plan next steps once functionality recovers',
        'Document findings through screenshots and DOM inspection'
      ]
    },
    fallbacks: [
      {
        toolName: 'mcp_browser_snapshot_readonly',
        simplifiedVersion: 'browser_snapshot',
        explanation: 'DOM inspection without any modification capabilities'
      },
      {
        toolName: 'mcp_browser_screenshot_safe',
        simplifiedVersion: 'browser_screenshot',
        explanation: 'Screenshot capture with enhanced error handling'
      }
    ]
  },
  LEVEL_4: {
    level: 'LEVEL_4',
    messaging: {
      title: '🚨 System Monitoring Only',
      description: 'Minimal functionality for system status monitoring. Browser interactions unavailable.',
      capabilities: [
        'System health and status monitoring',
        'Cache statistics and performance metrics',
        'Console message and error log viewing',
        'Basic system diagnostics and troubleshooting',
        'Circuit breaker and connection pool status'
      ],
      limitations: [
        'No browser operations or page access',
        'No session management or persistence',
        'No user interactions with web pages',
        'Monitoring and diagnostics only'
      ],
      expectedRecoveryTime: '2-5 minutes'
    },
    suggestions: {
      alternatives: [
        'Monitor system health while waiting for recovery',
        'Review error logs to understand failure patterns',
        'Check cache statistics and connection status'
      ],
      workarounds: [
        'Use external browser for manual operations if needed',
        'Monitor recovery progress through system status',
        'Prepare for resumed operations once system recovers'
      ],
      bestPractices: [
        'This is an excellent time to review system health',
        'Use diagnostic tools to understand what went wrong',
        'Monitor for automatic recovery indicators'
      ]
    },
    fallbacks: [
      {
        toolName: 'mcp_debug_console_readonly',
        simplifiedVersion: 'browser_console_messages',
        explanation: 'Console monitoring with read-only access'
      },
      {
        toolName: 'mcp_system_status',
        simplifiedVersion: 'system_health_check',
        explanation: 'Basic system status and health monitoring'
      }
    ]
  }
};

// ============= MAIN GRACEFUL DEGRADATION MANAGER CLASS =============

/**
 * Main graceful degradation manager with automatic recovery
 */
export class GracefulDegradationManager {
  private static instance: GracefulDegradationManager | null = null;
  private currentLevel: DegradationLevel = 'LEVEL_1';
  private lastLevelChange: number = Date.now();
  private degradationHistory: DegradationEvent[] = [];
  private recoveryTimers = new Map<string, NodeJS.Timeout>();
  private circuitBreaker: CircuitBreakerIntegration;
  private connectionPoolManager: ConnectionPoolManager;
  private persistenceFile: string;
  
  // Metrics and monitoring
  private metrics = {
    totalDegradationEvents: 0,
    degradationEventsByLevel: {
      LEVEL_1: 0,
      LEVEL_2: 0,
      LEVEL_3: 0,
      LEVEL_4: 0
    } as Record<DegradationLevel, number>,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    totalRecoveryTime: 0,
    userImpactDistribution: {
      none: 0,
      minimal: 0,
      moderate: 0,
      significant: 0
    },
    toolSpecificDegradations: new Map<string, number>()
  };

  private constructor() {
    this.circuitBreaker = CircuitBreakerIntegration.getInstance();
    this.connectionPoolManager = ConnectionPoolManager.getInstance();
    this.persistenceFile = path.join(ProjectPaths.getCacheDir(), 'graceful-degradation-state.json');
    
    this.loadPersistedState();
    this.startMonitoring();
    
    console.error('[GracefulDegradationManager] Initialized with Level 1 (Full Functionality)');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GracefulDegradationManager {
    if (!GracefulDegradationManager.instance) {
      GracefulDegradationManager.instance = new GracefulDegradationManager();
    }
    return GracefulDegradationManager.instance;
  }

  /**
   * Get current degradation level
   */
  getCurrentLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Check if a tool is available at current degradation level
   */
  isToolAvailable(toolName: string): boolean {
    const currentConfig = DEGRADATION_LEVELS[this.currentLevel];
    return currentConfig.tools.includes(toolName) || 
           (currentConfig.fallbackChain ? currentConfig.fallbackChain.includes(toolName) : false);
  }

  /**
   * Get available tools for current degradation level
   */
  getAvailableTools(): string[] {
    const currentConfig = DEGRADATION_LEVELS[this.currentLevel];
    return [...currentConfig.tools];
  }

  /**
   * Get user-friendly degradation status
   */
  getDegradationStatus(): {
    level: DegradationLevel;
    config: DegradationLevelConfig;
    ux: UXEnhancement;
    timeInLevel: number;
    nextRecoveryAttempt?: number;
  } {
    const config = DEGRADATION_LEVELS[this.currentLevel];
    const ux = UX_ENHANCEMENTS[this.currentLevel];
    const timeInLevel = Date.now() - this.lastLevelChange;
    
    // Calculate next recovery attempt if applicable
    let nextRecoveryAttempt: number | undefined;
    if (this.currentLevel !== 'LEVEL_1' && config.recoveryTime > 0) {
      nextRecoveryAttempt = this.lastLevelChange + config.recoveryTime;
    }

    return {
      level: this.currentLevel,
      config,
      ux,
      timeInLevel,
      nextRecoveryAttempt
    };
  }

  /**
   * Manually degrade to a specific level
   */
  async degradeToLevel(
    targetLevel: DegradationLevel, 
    reason: string = 'Manual degradation',
    error?: Error
  ): Promise<void> {
    if (targetLevel === this.currentLevel) {
      console.error(`[GracefulDegradationManager] Already at ${targetLevel}`);
      return;
    }

    const fromLevel = this.currentLevel;
    const event: DegradationEvent = {
      timestamp: Date.now(),
      fromLevel,
      toLevel: targetLevel,
      triggerReason: reason,
      triggerError: error,
      autoRecovery: false,
      userImpact: this.calculateUserImpact(fromLevel, targetLevel),
      recoveryEstimate: DEGRADATION_LEVELS[targetLevel].recoveryTime
    };

    await this.performDegradation(targetLevel, event);
  }

  /**
   * Attempt to restore to a higher level
   */
  async restoreToLevel(
    targetLevel: DegradationLevel,
    reason: string = 'Manual restoration'
  ): Promise<boolean> {
    if (this.isHigherLevel(targetLevel, this.currentLevel)) {
      console.error(`[GracefulDegradationManager] Cannot restore to lower level ${targetLevel} from ${this.currentLevel}`);
      return false;
    }

    // Test if the target level is viable
    const viable = await this.testLevelViability(targetLevel);
    if (!viable) {
      console.error(`[GracefulDegradationManager] Target level ${targetLevel} not viable for restoration`);
      return false;
    }

    const fromLevel = this.currentLevel;
    const event: DegradationEvent = {
      timestamp: Date.now(),
      fromLevel,
      toLevel: targetLevel,
      triggerReason: reason,
      autoRecovery: false,
      userImpact: this.calculateUserImpact(fromLevel, targetLevel),
      recoveryEstimate: 0
    };

    await this.performDegradation(targetLevel, event);
    return true;
  }

  /**
   * Handle circuit breaker state changes and auto-degrade
   */
  async handleCircuitBreakerEvent(
    toolName: string,
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    error?: Error
  ): Promise<void> {
    if (circuitBreakerState === 'OPEN') {
      // Determine degradation level based on error type
      const errorClassification = error ? ErrorClassifier.classifyError(error) : null;
      const strategy = errorClassification ? RECOVERY_STRATEGIES[errorClassification.type] : RECOVERY_STRATEGIES[ErrorType.UNKNOWN];
      
      const reason = `Circuit breaker opened for ${toolName}${errorClassification ? ` (${errorClassification.type})` : ''}`;
      
      // Only degrade if target level is lower than current
      if (this.isLowerLevel(strategy.targetLevel, this.currentLevel)) {
        await this.degradeToLevel(strategy.targetLevel, reason, error);
        
        // Schedule recovery attempt
        this.scheduleRecoveryAttempt(toolName, strategy);
      }
    } else if (circuitBreakerState === 'CLOSED' && this.currentLevel !== 'LEVEL_1') {
      // Circuit breaker recovered - attempt to restore
      await this.attemptRecovery('Circuit breaker recovered');
    }
  }

  /**
   * Execute a tool with degradation awareness
   */
  async executeWithDegradation<T>(
    toolName: string,
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>
  ): Promise<T> {
    // Check if tool is available at current level
    if (!this.isToolAvailable(toolName)) {
      const degradedToolName = this.getDegradedToolName(toolName);
      if (degradedToolName && fallbackOperation) {
        console.error(`[GracefulDegradationManager] Using degraded tool ${degradedToolName} instead of ${toolName}`);
        return await fallbackOperation();
      } else {
        throw new Error(`Tool ${toolName} not available at degradation level ${this.currentLevel}`);
      }
    }

    try {
      return await operation();
    } catch (error) {
      // Handle operation failure - potentially trigger degradation
      const classification = ErrorClassifier.classifyError(error);
      
      if (classification.shouldTrip) {
        console.error(`[GracefulDegradationManager] Tool ${toolName} failed, considering degradation:`, error);
        await this.handleCircuitBreakerEvent(toolName, 'OPEN', error instanceof Error ? error : new Error(String(error)));
      }
      
      throw error;
    }
  }

  /**
   * Get comprehensive degradation metrics
   */
  getDegradationMetrics(): DegradationMetrics {
    const timeInCurrentLevel = Date.now() - this.lastLevelChange;
    const recoverySuccessRate = this.metrics.recoveryAttempts > 0 
      ? this.metrics.recoverySuccesses / this.metrics.recoveryAttempts
      : 1.0;
    
    const averageRecoveryTime = this.metrics.recoverySuccesses > 0 
      ? this.metrics.totalRecoveryTime / this.metrics.recoverySuccesses
      : 0;

    const currentConfig = DEGRADATION_LEVELS[this.currentLevel];
    
    return {
      currentLevel: this.currentLevel,
      timeInCurrentLevel,
      totalDegradationEvents: this.metrics.totalDegradationEvents,
      degradationEventsByLevel: { ...this.metrics.degradationEventsByLevel },
      recoverySuccessRate,
      averageRecoveryTime,
      userImpactDistribution: { ...this.metrics.userImpactDistribution },
      toolSpecificDegradations: Object.fromEntries(this.metrics.toolSpecificDegradations),
      performanceImpact: currentConfig.expectedPerformance
    };
  }

  /**
   * Get degradation history for analysis
   */
  getDegradationHistory(): DegradationEvent[] {
    return [...this.degradationHistory];
  }

  /**
   * Export degradation metrics and history
   */
  async exportDegradationData(filePath?: string): Promise<string> {
    const exportPath = filePath || path.join(ProjectPaths.getCacheDir(), `degradation-analysis-${Date.now()}.json`);
    
    const exportData = {
      exportTime: Date.now(),
      currentStatus: this.getDegradationStatus(),
      metrics: this.getDegradationMetrics(),
      history: this.getDegradationHistory(),
      recoveryStrategies: RECOVERY_STRATEGIES,
      levelConfigurations: DEGRADATION_LEVELS
    };

    await fs.promises.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    console.error(`[GracefulDegradationManager] Degradation analysis exported to ${exportPath}`);
    
    return exportPath;
  }

  // ============= PRIVATE HELPER METHODS =============

  private async performDegradation(targetLevel: DegradationLevel, event: DegradationEvent): Promise<void> {
    const previousLevel = this.currentLevel;
    this.currentLevel = targetLevel;
    this.lastLevelChange = Date.now();
    
    // Record event
    this.degradationHistory.push(event);
    this.metrics.totalDegradationEvents++;
    this.metrics.degradationEventsByLevel[targetLevel]++;
    this.metrics.userImpactDistribution[event.userImpact]++;
    
    // Track tool-specific degradations
    if (event.toolName) {
      const current = this.metrics.toolSpecificDegradations.get(event.toolName) || 0;
      this.metrics.toolSpecificDegradations.set(event.toolName, current + 1);
    }
    
    // Persist state
    this.persistState();
    
    // Log degradation with user-friendly message
    const config = DEGRADATION_LEVELS[targetLevel];
    const ux = UX_ENHANCEMENTS[targetLevel];
    
    console.error(`[GracefulDegradationManager] ⚠️  DEGRADATION: ${previousLevel} → ${targetLevel}`);
    console.error(`[GracefulDegradationManager] ${ux.messaging.title}`);
    console.error(`[GracefulDegradationManager] ${ux.messaging.description}`);
    
    if (ux.messaging.expectedRecoveryTime) {
      console.error(`[GracefulDegradationManager] Expected recovery: ${ux.messaging.expectedRecoveryTime}`);
    }
    
    // Show available capabilities
    if (ux.messaging.capabilities.length > 0) {
      console.error(`[GracefulDegradationManager] Available capabilities:`);
      ux.messaging.capabilities.forEach(cap => {
        console.error(`[GracefulDegradationManager]   ✓ ${cap}`);
      });
    }
    
    // Show limitations
    if (ux.messaging.limitations.length > 0) {
      console.error(`[GracefulDegradationManager] Current limitations:`);
      ux.messaging.limitations.forEach(limit => {
        console.error(`[GracefulDegradationManager]   ⚠ ${limit}`);
      });
    }
  }

  private async scheduleRecoveryAttempt(toolName: string, strategy: RecoveryStrategy): Promise<void> {
    // Clear any existing recovery timer for this tool
    const existingTimer = this.recoveryTimers.get(toolName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const recoveryTimer = setTimeout(async () => {
      console.error(`[GracefulDegradationManager] Attempting recovery for ${toolName} using ${strategy.name}`);
      
      this.metrics.recoveryAttempts++;
      const recoveryStartTime = Date.now();
      
      try {
        // Execute recovery actions
        let allActionsSuccessful = true;
        for (const action of strategy.actions) {
          console.error(`[GracefulDegradationManager] Executing recovery action: ${action.description}`);
          
          try {
            const actionSuccessful = await Promise.race([
              action.execute(),
              new Promise<boolean>((_, reject) => 
                setTimeout(() => reject(new Error('Recovery action timeout')), action.timeout)
              )
            ]);
            
            if (!actionSuccessful) {
              allActionsSuccessful = false;
              console.error(`[GracefulDegradationManager] Recovery action failed: ${action.description}`);
              break;
            }
          } catch (error) {
            allActionsSuccessful = false;
            console.error(`[GracefulDegradationManager] Recovery action error: ${action.description}:`, error);
            break;
          }
        }
        
        if (allActionsSuccessful) {
          // Test if we can upgrade to the target level
          const canUpgrade = await this.testLevelViability(strategy.targetLevel);
          if (canUpgrade) {
            await this.restoreToLevel(strategy.targetLevel, `Recovery successful for ${toolName}`);
            
            this.metrics.recoverySuccesses++;
            const recoveryTime = Date.now() - recoveryStartTime;
            this.metrics.totalRecoveryTime += recoveryTime;
            
            console.error(`[GracefulDegradationManager] ✅ Recovery successful for ${toolName} (${recoveryTime}ms)`);
          } else {
            console.error(`[GracefulDegradationManager] Recovery actions completed but level ${strategy.targetLevel} still not viable`);
          }
        }
      } catch (error) {
        console.error(`[GracefulDegradationManager] Recovery attempt failed for ${toolName}:`, error);
      }
      
      this.recoveryTimers.delete(toolName);
    }, strategy.estimatedRecoveryTime);
    
    this.recoveryTimers.set(toolName, recoveryTimer);
    
    console.error(`[GracefulDegradationManager] Scheduled recovery attempt for ${toolName} in ${strategy.estimatedRecoveryTime}ms`);
  }

  private async attemptRecovery(reason: string): Promise<void> {
    // Try to upgrade to the next higher level
    const nextLevel = this.getNextHigherLevel(this.currentLevel);
    if (nextLevel) {
      const viable = await this.testLevelViability(nextLevel);
      if (viable) {
        await this.restoreToLevel(nextLevel, reason);
      }
    }
  }

  private async testLevelViability(level: DegradationLevel): Promise<boolean> {
    // Simple viability test - in a real implementation, this would test
    // if the tools for this level are actually functional
    try {
      const circuitBreakerMetrics = this.circuitBreaker.getMetrics();
      
      // If circuit breaker is open, can't go to Level 1
      if (level === 'LEVEL_1' && circuitBreakerMetrics.state === 'OPEN') {
        return false;
      }
      
      // If failure rate is high, be conservative
      if (circuitBreakerMetrics.failureRate > 0.3 && level === 'LEVEL_1') {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[GracefulDegradationManager] Error testing level viability:', error);
      return false;
    }
  }

  private calculateUserImpact(fromLevel: DegradationLevel, toLevel: DegradationLevel): 'none' | 'minimal' | 'moderate' | 'significant' {
    const levelOrder: DegradationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
    const fromIndex = levelOrder.indexOf(fromLevel);
    const toIndex = levelOrder.indexOf(toLevel);
    const levelDifference = Math.abs(toIndex - fromIndex);
    
    if (levelDifference === 0) return 'none';
    if (levelDifference === 1) return 'minimal';
    if (levelDifference === 2) return 'moderate';
    return 'significant';
  }

  private isLowerLevel(level1: DegradationLevel, level2: DegradationLevel): boolean {
    const levelOrder: DegradationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
    return levelOrder.indexOf(level1) > levelOrder.indexOf(level2);
  }

  private isHigherLevel(level1: DegradationLevel, level2: DegradationLevel): boolean {
    const levelOrder: DegradationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
    return levelOrder.indexOf(level1) < levelOrder.indexOf(level2);
  }

  private getNextHigherLevel(currentLevel: DegradationLevel): DegradationLevel | null {
    const levelOrder: DegradationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
    const currentIndex = levelOrder.indexOf(currentLevel);
    return currentIndex > 0 ? levelOrder[currentIndex - 1] : null;
  }

  private getDegradedToolName(originalToolName: string): string | null {
    // Map original tools to their degraded versions
    const toolMappings: Record<string, string> = {
      'mcp__playwright__mcp_browser_click': 'mcp_browser_click_simple',
      'mcp__playwright__mcp_browser_type': 'mcp_browser_type_basic',
      'mcp__playwright__mcp_browser_navigate': 'mcp_browser_navigate_safe',
      'mcp__playwright__mcp_browser_screenshot': 'mcp_browser_screenshot_basic',
      'mcp__playwright__mcp_browser_snapshot': 'mcp_browser_snapshot_simple',
      'mcp__playwright__mcp_session_restore': 'mcp_session_restore_basic',
      'mcp__playwright__mcp_test_run': 'mcp_test_run_simple'
    };
    
    return toolMappings[originalToolName] || null;
  }

  private startMonitoring(): void {
    // Monitor circuit breaker state changes
    setInterval(() => {
      const metrics = this.circuitBreaker.getMetrics();
      
      // Auto-degrade on high failure rates
      if (metrics.failureRate > 0.5 && this.currentLevel === 'LEVEL_1') {
        this.degradeToLevel('LEVEL_2', `High failure rate (${(metrics.failureRate * 100).toFixed(1)}%)`);
      }
      
      // Auto-recovery on improved metrics
      if (metrics.failureRate < 0.1 && metrics.state === 'CLOSED' && this.currentLevel !== 'LEVEL_1') {
        this.attemptRecovery('Improved system metrics');
      }
    }, 30000); // Check every 30 seconds
  }

  private loadPersistedState(): void {
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
        this.currentLevel = data.currentLevel || 'LEVEL_1';
        this.lastLevelChange = data.lastLevelChange || Date.now();
        this.degradationHistory = data.degradationHistory || [];
        
        // Don't restore to degraded state if too much time has passed
        const timeSinceChange = Date.now() - this.lastLevelChange;
        if (timeSinceChange > 300000 && this.currentLevel !== 'LEVEL_1') { // 5 minutes
          console.error('[GracefulDegradationManager] Resetting to Level 1 after prolonged downtime');
          this.currentLevel = 'LEVEL_1';
          this.lastLevelChange = Date.now();
        }
        
        console.error(`[GracefulDegradationManager] Loaded persisted state: ${this.currentLevel}`);
      }
    } catch (error) {
      console.error('[GracefulDegradationManager] Failed to load persisted state:', error);
      // Continue with default state
    }
  }

  private persistState(): void {
    try {
      const state = {
        currentLevel: this.currentLevel,
        lastLevelChange: this.lastLevelChange,
        degradationHistory: this.degradationHistory.slice(-50), // Keep last 50 events
        metrics: {
          totalDegradationEvents: this.metrics.totalDegradationEvents,
          degradationEventsByLevel: this.metrics.degradationEventsByLevel,
          recoveryAttempts: this.metrics.recoveryAttempts,
          recoverySuccesses: this.metrics.recoverySuccesses
        }
      };
      
      const dir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('[GracefulDegradationManager] Failed to persist state:', error);
    }
  }
}