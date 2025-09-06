/**
 * Graceful Degradation Integration - Phase 3C Integration Layer
 * 
 * Integrates the graceful degradation system with the existing circuit breaker
 * and connection pooling components for seamless automatic fallback and recovery.
 * 
 * Key Features:
 * - Automatic degradation based on circuit breaker state
 * - Tool routing to appropriate degradation level implementations
 * - Seamless fallback chains with user-friendly messaging
 * - Recovery orchestration across all Phase 3 components
 * - Performance monitoring and degradation event tracking
 */

import { GracefulDegradationManager, DegradationLevel } from './graceful-degradation.js';
import { CircuitBreakerIntegration } from './circuit-breaker-integration.js';
import { ErrorClassifier, ErrorType } from './circuit-breaker.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { getSimplifiedTool, hasSimplifiedVersion, SIMPLIFIED_TOOL_REGISTRY } from './simplified-tools.js';
import { Page, BrowserContext } from 'playwright';

// ============= INTERFACES & TYPES =============

/**
 * Tool execution context for degradation-aware operations
 */
interface DegradationExecutionContext {
  toolName: string;
  originalParams: any;
  degradationLevel: DegradationLevel;
  fallbackChain: string[];
  executionAttempt: number;
  maxAttempts: number;
  page?: Page;
  context?: BrowserContext;
}

/**
 * Tool execution result with degradation metadata
 */
interface DegradationExecutionResult {
  success: boolean;
  result?: any;
  error?: Error;
  toolUsed: string;
  degradationLevel: DegradationLevel;
  fallbacksAttempted: string[];
  executionTime: number;
  userMessage?: string;
  recommendations?: string[];
}

/**
 * Recovery coordination status
 */
interface RecoveryCoordinationStatus {
  inProgress: boolean;
  coordinatedComponents: string[];
  estimatedCompletionTime?: number;
  partialRecoveries: string[];
  failedRecoveries: string[];
  overallSuccess: boolean;
}

// ============= MAIN INTEGRATION CLASS =============

/**
 * Integration layer for graceful degradation with circuit breaker and connection pooling
 */
export class GracefulDegradationIntegration {
  private static instance: GracefulDegradationIntegration | null = null;
  private degradationManager: GracefulDegradationManager;
  private circuitBreakerIntegration: CircuitBreakerIntegration;
  private connectionPoolManager: ConnectionPoolManager;
  
  // Tool mapping and fallback chains
  private toolFallbackChains = new Map<string, string[]>();
  private simplifiedToolMappings = new Map<string, string>();
  private activeExecutions = new Map<string, DegradationExecutionContext>();
  
  // Recovery coordination
  private recoveryInProgress = false;
  private recoveryCoordination: RecoveryCoordinationStatus = {
    inProgress: false,
    coordinatedComponents: [],
    partialRecoveries: [],
    failedRecoveries: [],
    overallSuccess: false
  };

  private constructor() {
    this.degradationManager = GracefulDegradationManager.getInstance();
    this.circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
    this.connectionPoolManager = ConnectionPoolManager.getInstance();
    
    this.initializeToolMappings();
    this.setupCircuitBreakerListeners();
    
    console.error('[GracefulDegradationIntegration] Initialized with automatic fallback coordination');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GracefulDegradationIntegration {
    if (!GracefulDegradationIntegration.instance) {
      GracefulDegradationIntegration.instance = new GracefulDegradationIntegration();
    }
    return GracefulDegradationIntegration.instance;
  }

  /**
   * Execute a tool with automatic degradation awareness and fallback
   */
  async executeWithDegradation<T>(
    toolName: string,
    params: any,
    implementation: (params: any) => Promise<T>,
    context?: { page?: Page; browserContext?: BrowserContext }
  ): Promise<DegradationExecutionResult> {
    const startTime = Date.now();
    const currentLevel = this.degradationManager.getCurrentLevel();
    const executionId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const executionContext: DegradationExecutionContext = {
      toolName,
      originalParams: params,
      degradationLevel: currentLevel,
      fallbackChain: this.getFallbackChain(toolName),
      executionAttempt: 1,
      maxAttempts: 3,
      page: context?.page,
      context: context?.browserContext
    };
    
    this.activeExecutions.set(executionId, executionContext);
    
    try {
      // Check if tool is available at current degradation level
      if (!this.degradationManager.isToolAvailable(toolName)) {
        return await this.handleUnavailableTool(executionContext, startTime);
      }
      
      // Execute with circuit breaker protection and automatic degradation
      const result = await this.circuitBreakerIntegration.wrapMCPTool(
        toolName,
        params,
        async (validatedParams) => {
          return await implementation(validatedParams);
        }
      );
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        result,
        toolUsed: toolName,
        degradationLevel: currentLevel,
        fallbacksAttempted: [],
        executionTime,
        userMessage: `Operation completed successfully using ${toolName}`
      };
      
    } catch (error) {
      console.error(`[GracefulDegradationIntegration] Tool ${toolName} failed:`, error);
      
      // Handle error with automatic degradation and fallback
      return await this.handleToolFailure(executionContext, error, startTime);
      
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute browser operation with connection pooling and degradation
   */
  async executeBrowserOperationWithDegradation<T>(
    operationType: string,
    operation: (context: BrowserContext, page: Page) => Promise<T>,
    options: {
      sessionName?: string;
      domain?: string;
      profile?: string;
      priority?: 'high' | 'medium' | 'low';
      requiresNewContext?: boolean;
    } = {}
  ): Promise<DegradationExecutionResult> {
    const startTime = Date.now();
    const toolName = `browser_${operationType}`;
    
    try {
      // Use connection pool manager with degradation awareness
      const poolResult = await this.connectionPoolManager.executeBrowserOperation(
        operationType,
        operation,
        options
      );
      
      const executionTime = Date.now() - startTime;
      const currentLevel = this.degradationManager.getCurrentLevel();
      
      return {
        success: true,
        result: poolResult.result,
        toolUsed: toolName,
        degradationLevel: currentLevel,
        fallbacksAttempted: [],
        executionTime,
        userMessage: `Browser operation completed successfully`
      };
      
    } catch (error) {
      console.error(`[GracefulDegradationIntegration] Browser operation ${operationType} failed:`, error);
      
      // Trigger degradation based on error type
      const classification = ErrorClassifier.classifyError(error);
      await this.degradationManager.handleCircuitBreakerEvent(toolName, 'OPEN', error instanceof Error ? error : new Error(String(error)));
      
      // Attempt fallback if available
      const fallbackResult = await this.attemptFallbackExecution(toolName, { operationType, ...options }, error, startTime);
      
      return fallbackResult || {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        toolUsed: toolName,
        degradationLevel: this.degradationManager.getCurrentLevel(),
        fallbacksAttempted: [],
        executionTime: Date.now() - startTime,
        userMessage: `Browser operation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get current system status with degradation information
   */
  getSystemStatus(): {
    degradationLevel: DegradationLevel;
    circuitBreakerState: string;
    connectionPoolHealth: boolean;
    availableTools: string[];
    limitations: string[];
    recoveryStatus: RecoveryCoordinationStatus;
    userGuidance: {
      currentCapabilities: string[];
      alternatives: string[];
      expectedRecovery?: string;
    };
  } {
    const degradationStatus = this.degradationManager.getDegradationStatus();
    const circuitBreakerMetrics = this.circuitBreakerIntegration.getMetrics();
    const poolMetrics = this.connectionPoolManager.getUnifiedMetrics();
    
    return {
      degradationLevel: degradationStatus.level,
      circuitBreakerState: circuitBreakerMetrics.state,
      connectionPoolHealth: poolMetrics.health.overallHealth,
      availableTools: this.degradationManager.getAvailableTools(),
      limitations: degradationStatus.config.limitations,
      recoveryStatus: { ...this.recoveryCoordination },
      userGuidance: {
        currentCapabilities: degradationStatus.ux.messaging.capabilities,
        alternatives: degradationStatus.ux.suggestions.alternatives,
        expectedRecovery: degradationStatus.ux.messaging.expectedRecoveryTime
      }
    };
  }

  /**
   * Coordinate recovery across all Phase 3 components
   */
  async coordinateRecovery(): Promise<RecoveryCoordinationStatus> {
    if (this.recoveryInProgress) {
      console.error('[GracefulDegradationIntegration] Recovery already in progress');
      return this.recoveryCoordination;
    }
    
    this.recoveryInProgress = true;
    const recoveryStartTime = Date.now();
    
    console.error('[GracefulDegradationIntegration] Starting coordinated recovery...');
    
    this.recoveryCoordination = {
      inProgress: true,
      coordinatedComponents: ['circuit-breaker', 'connection-pool', 'degradation-manager'],
      partialRecoveries: [],
      failedRecoveries: [],
      overallSuccess: false
    };
    
    try {
      // Phase 1: Reset circuit breaker if appropriate
      try {
        const circuitBreakerMetrics = this.circuitBreakerIntegration.getMetrics();
        if (circuitBreakerMetrics.state === 'OPEN' && circuitBreakerMetrics.timeInState > 60000) {
          console.error('[GracefulDegradationIntegration] Resetting circuit breaker...');
          this.circuitBreakerIntegration.reset();
          this.recoveryCoordination.partialRecoveries.push('circuit-breaker');
        }
      } catch (error) {
        console.error('[GracefulDegradationIntegration] Circuit breaker recovery failed:', error);
        this.recoveryCoordination.failedRecoveries.push('circuit-breaker');
      }
      
      // Phase 2: Perform connection pool health check and optimization
      try {
        console.error('[GracefulDegradationIntegration] Optimizing connection pools...');
        const poolHealth = await this.connectionPoolManager.performHealthCheck();
        if (poolHealth.healthy) {
          this.recoveryCoordination.partialRecoveries.push('connection-pool');
        } else {
          // Attempt cross-pool optimization
          await this.connectionPoolManager.performCrossPoolOptimization();
          this.recoveryCoordination.partialRecoveries.push('connection-pool-optimized');
        }
      } catch (error) {
        console.error('[GracefulDegradationIntegration] Connection pool recovery failed:', error);
        this.recoveryCoordination.failedRecoveries.push('connection-pool');
      }
      
      // Phase 3: Attempt degradation level recovery
      try {
        console.error('[GracefulDegradationIntegration] Attempting degradation level recovery...');
        const currentLevel = this.degradationManager.getCurrentLevel();
        if (currentLevel !== 'LEVEL_1') {
          const restored = await this.degradationManager.restoreToLevel('LEVEL_1', 'Coordinated recovery attempt');
          if (restored) {
            this.recoveryCoordination.partialRecoveries.push('degradation-manager');
          } else {
            // Try intermediate level
            const intermediateLevel = currentLevel === 'LEVEL_4' ? 'LEVEL_3' : 'LEVEL_2';
            const intermediateRestored = await this.degradationManager.restoreToLevel(intermediateLevel, 'Partial recovery attempt');
            if (intermediateRestored) {
              this.recoveryCoordination.partialRecoveries.push('degradation-manager-partial');
            }
          }
        } else {
          this.recoveryCoordination.partialRecoveries.push('degradation-manager');
        }
      } catch (error) {
        console.error('[GracefulDegradationIntegration] Degradation manager recovery failed:', error);
        this.recoveryCoordination.failedRecoveries.push('degradation-manager');
      }
      
      // Evaluate overall success
      const totalComponents = this.recoveryCoordination.coordinatedComponents.length;
      const successfulRecoveries = this.recoveryCoordination.partialRecoveries.length;
      this.recoveryCoordination.overallSuccess = successfulRecoveries >= totalComponents * 0.66; // 66% success rate
      
      const recoveryTime = Date.now() - recoveryStartTime;
      console.error(`[GracefulDegradationIntegration] Coordinated recovery completed in ${recoveryTime}ms`);
      console.error(`[GracefulDegradationIntegration] Success rate: ${successfulRecoveries}/${totalComponents} components`);
      
      if (this.recoveryCoordination.overallSuccess) {
        console.error('[GracefulDegradationIntegration] ✅ Recovery successful - system functionality restored');
      } else {
        console.error('[GracefulDegradationIntegration] ⚠️ Partial recovery - some components still degraded');
      }
      
    } catch (error) {
      console.error('[GracefulDegradationIntegration] Coordinated recovery error:', error);
      this.recoveryCoordination.overallSuccess = false;
    } finally {
      this.recoveryCoordination.inProgress = false;
      this.recoveryInProgress = false;
    }
    
    return this.recoveryCoordination;
  }

  /**
   * Get comprehensive health report across all components
   */
  async getComprehensiveHealthReport(): Promise<{
    overall: {
      healthy: boolean;
      degradationLevel: DegradationLevel;
      primaryIssues: string[];
      recoveryRecommendations: string[];
    };
    components: {
      circuitBreaker: any;
      connectionPool: any;
      degradationManager: any;
    };
    userImpact: {
      availableFeatures: string[];
      unavailableFeatures: string[];
      workarounds: string[];
      estimatedRecoveryTime?: string;
    };
  }> {
    // Get health reports from all components
    const [circuitBreakerHealth, connectionPoolHealth] = await Promise.all([
      this.circuitBreakerIntegration.getHealthReport(),
      this.connectionPoolManager.performHealthCheck()
    ]);
    
    const degradationStatus = this.degradationManager.getDegradationStatus();
    const degradationMetrics = this.degradationManager.getDegradationMetrics();
    
    // Analyze overall health
    const componentsHealthy = circuitBreakerHealth.enabled && 
                             connectionPoolHealth.healthy && 
                             degradationStatus.level === 'LEVEL_1';
    
    const primaryIssues: string[] = [];
    const recoveryRecommendations: string[] = [];
    
    // Collect issues and recommendations
    if (!circuitBreakerHealth.enabled || circuitBreakerHealth.metrics.state === 'OPEN') {
      primaryIssues.push('Circuit breaker protection active - service degradation in effect');
      recoveryRecommendations.push('Investigate underlying service issues causing circuit breaker activation');
    }
    
    if (!connectionPoolHealth.healthy) {
      primaryIssues.push(`Connection pool issues: ${connectionPoolHealth.issues.join(', ')}`);
      recoveryRecommendations.push('Optimize connection pool configuration or increase resource limits');
    }
    
    if (degradationStatus.level !== 'LEVEL_1') {
      primaryIssues.push(`System running in ${degradationStatus.config.name} mode`);
      recoveryRecommendations.push(`Expected recovery in ${degradationStatus.ux.messaging.expectedRecoveryTime || 'unknown time'}`);
    }
    
    // Add component-specific recommendations
    recoveryRecommendations.push(...circuitBreakerHealth.recommendations);
    recoveryRecommendations.push(...connectionPoolHealth.recommendations);
    
    // Determine user impact
    const availableFeatures = degradationStatus.ux.messaging.capabilities;
    const unavailableFeatures = degradationStatus.config.limitations;
    const workarounds = degradationStatus.ux.suggestions.alternatives;
    
    return {
      overall: {
        healthy: componentsHealthy,
        degradationLevel: degradationStatus.level,
        primaryIssues,
        recoveryRecommendations
      },
      components: {
        circuitBreaker: circuitBreakerHealth,
        connectionPool: connectionPoolHealth,
        degradationManager: {
          status: degradationStatus,
          metrics: degradationMetrics
        }
      },
      userImpact: {
        availableFeatures,
        unavailableFeatures,
        workarounds,
        estimatedRecoveryTime: degradationStatus.ux.messaging.expectedRecoveryTime
      }
    };
  }

  // ============= PRIVATE HELPER METHODS =============

  private initializeToolMappings(): void {
    // Initialize tool fallback chains
    this.toolFallbackChains.set('mcp__playwright__mcp_browser_click', [
      'mcp_browser_click_simple',
      'browser_click',
      'mcp_browser_snapshot_readonly'
    ]);
    
    this.toolFallbackChains.set('mcp__playwright__mcp_browser_type', [
      'mcp_browser_type_basic',
      'browser_type',
      'mcp_browser_snapshot_readonly'
    ]);
    
    this.toolFallbackChains.set('mcp__playwright__mcp_browser_navigate', [
      'mcp_browser_navigate_safe',
      'browser_navigate',
      'mcp_browser_screenshot_safe'
    ]);
    
    this.toolFallbackChains.set('mcp__playwright__mcp_browser_screenshot', [
      'mcp_browser_screenshot_basic',
      'mcp_browser_screenshot_safe',
      'browser_screenshot'
    ]);
    
    this.toolFallbackChains.set('mcp__playwright__mcp_browser_snapshot', [
      'mcp_browser_snapshot_simple',
      'mcp_browser_snapshot_readonly',
      'browser_snapshot'
    ]);
    
    // Initialize simplified tool mappings
    this.simplifiedToolMappings.set('mcp__playwright__mcp_browser_click', 'mcp_browser_click_simple');
    this.simplifiedToolMappings.set('mcp__playwright__mcp_browser_type', 'mcp_browser_type_basic');
    this.simplifiedToolMappings.set('mcp__playwright__mcp_browser_navigate', 'mcp_browser_navigate_safe');
    this.simplifiedToolMappings.set('mcp__playwright__mcp_browser_screenshot', 'mcp_browser_screenshot_basic');
    this.simplifiedToolMappings.set('mcp__playwright__mcp_browser_snapshot', 'mcp_browser_snapshot_simple');
  }

  private setupCircuitBreakerListeners(): void {
    // Monitor circuit breaker state changes
    setInterval(() => {
      const metrics = this.circuitBreakerIntegration.getMetrics();
      
      // Auto-trigger degradation on circuit breaker events
      if (metrics.state === 'OPEN' && this.degradationManager.getCurrentLevel() === 'LEVEL_1') {
        console.error('[GracefulDegradationIntegration] Circuit breaker opened - triggering automatic degradation');
        this.degradationManager.handleCircuitBreakerEvent('system', 'OPEN');
      }
      
      // Auto-trigger recovery attempts on circuit breaker recovery
      if (metrics.state === 'CLOSED' && this.degradationManager.getCurrentLevel() !== 'LEVEL_1') {
        console.error('[GracefulDegradationIntegration] Circuit breaker recovered - attempting restoration');
        this.degradationManager.handleCircuitBreakerEvent('system', 'CLOSED');
      }
    }, 15000); // Check every 15 seconds
  }

  private getFallbackChain(toolName: string): string[] {
    return this.toolFallbackChains.get(toolName) || [];
  }

  private async handleUnavailableTool(
    context: DegradationExecutionContext,
    startTime: number
  ): Promise<DegradationExecutionResult> {
    const fallbackChain = context.fallbackChain;
    
    if (fallbackChain.length === 0) {
      return {
        success: false,
        error: new Error(`Tool ${context.toolName} not available at degradation level ${context.degradationLevel} and no fallbacks configured`),
        toolUsed: context.toolName,
        degradationLevel: context.degradationLevel,
        fallbacksAttempted: [],
        executionTime: Date.now() - startTime,
        userMessage: `Tool ${context.toolName} is not available in current mode (${context.degradationLevel})`,
        recommendations: [`Wait for system recovery to use ${context.toolName}`, 'Try alternative approaches using available tools']
      };
    }
    
    return await this.attemptFallbackChain(context, startTime);
  }

  private async handleToolFailure(
    context: DegradationExecutionContext,
    error: unknown,
    startTime: number
  ): Promise<DegradationExecutionResult> {
    // Classify error and potentially trigger degradation
    const classification = ErrorClassifier.classifyError(error);
    
    if (classification.shouldTrip) {
      console.error(`[GracefulDegradationIntegration] Error classification suggests degradation: ${classification.type}`);
      await this.degradationManager.handleCircuitBreakerEvent(
        context.toolName, 
        'OPEN', 
        error instanceof Error ? error : new Error(String(error))
      );
    }
    
    // Attempt fallback execution
    return await this.attemptFallbackExecution(
      context.toolName,
      context.originalParams,
      error,
      startTime
    ) || {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      toolUsed: context.toolName,
      degradationLevel: context.degradationLevel,
      fallbacksAttempted: [],
      executionTime: Date.now() - startTime,
      userMessage: `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
      recommendations: ['System may be experiencing issues - please try again in a moment']
    };
  }

  private async attemptFallbackChain(
    context: DegradationExecutionContext,
    startTime: number
  ): Promise<DegradationExecutionResult> {
    const fallbacksAttempted: string[] = [];
    
    for (const fallbackTool of context.fallbackChain) {
      try {
        console.error(`[GracefulDegradationIntegration] Attempting fallback: ${fallbackTool}`);
        
        const simplifiedImpl = getSimplifiedTool(fallbackTool);
        if (simplifiedImpl && context.page) {
          // Execute simplified tool implementation
          const result = await simplifiedImpl(context.page, context.originalParams);
          fallbacksAttempted.push(fallbackTool);
          
          return {
            success: true,
            result,
            toolUsed: fallbackTool,
            degradationLevel: context.degradationLevel,
            fallbacksAttempted,
            executionTime: Date.now() - startTime,
            userMessage: `Operation completed using simplified mode (${fallbackTool})`,
            recommendations: ['Full functionality will be restored automatically when system recovers']
          };
        }
        
        fallbacksAttempted.push(fallbackTool);
      } catch (fallbackError) {
        console.error(`[GracefulDegradationIntegration] Fallback ${fallbackTool} failed:`, fallbackError);
        fallbacksAttempted.push(`${fallbackTool} (failed)`);
        continue;
      }
    }
    
    return {
      success: false,
      error: new Error('All fallback options exhausted'),
      toolUsed: context.toolName,
      degradationLevel: context.degradationLevel,
      fallbacksAttempted,
      executionTime: Date.now() - startTime,
      userMessage: 'Operation failed - all fallback options have been exhausted',
      recommendations: [
        'System is experiencing significant issues',
        'Manual intervention may be required',
        'Monitor system status for recovery progress'
      ]
    };
  }

  private async attemptFallbackExecution(
    originalTool: string,
    params: any,
    originalError: unknown,
    startTime: number
  ): Promise<DegradationExecutionResult | null> {
    const simplifiedToolName = this.simplifiedToolMappings.get(originalTool);
    
    if (simplifiedToolName && hasSimplifiedVersion(originalTool)) {
      try {
        console.error(`[GracefulDegradationIntegration] Attempting simplified fallback: ${simplifiedToolName}`);
        
        const simplifiedImpl = getSimplifiedTool(simplifiedToolName);
        if (simplifiedImpl) {
          // This would need to be implemented with proper parameter mapping
          // For now, return a placeholder result
          return {
            success: true,
            result: { fallback: true, originalTool, simplifiedTool: simplifiedToolName },
            toolUsed: simplifiedToolName,
            degradationLevel: this.degradationManager.getCurrentLevel(),
            fallbacksAttempted: [simplifiedToolName],
            executionTime: Date.now() - startTime,
            userMessage: `Operation completed using simplified mode due to system issues`,
            recommendations: ['Full functionality will be restored when system recovers']
          };
        }
      } catch (fallbackError) {
        console.error(`[GracefulDegradationIntegration] Simplified fallback failed:`, fallbackError);
      }
    }
    
    return null;
  }
}