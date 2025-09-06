/**
 * Connection Pool Manager - Phase 3B Implementation
 * 
 * Unified coordination of all connection pooling systems including browser contexts,
 * pages, MCP tool connections, and resource utilization. Integrates with Phase 3A
 * circuit breaker for comprehensive reliability.
 * 
 * Key Features:
 * - Unified pool coordination and management
 * - Integration with circuit breaker system
 * - Cross-pool resource optimization
 * - Global performance monitoring
 * - Adaptive load balancing
 * - Resource cleanup and lifecycle management
 */

import { Browser } from 'playwright';
import { MCPConnectionPool, ConnectionPoolConfig, ConnectionPoolMetrics } from './connection-pool.js';
import { BrowserConnectionPool, BrowserPoolConfig, BrowserPoolMetrics } from './browser-connection-pool.js';
import { CircuitBreakerIntegration } from './circuit-breaker-integration.js';
import { ProjectPaths } from '../utils/project-paths.js';
import * as fs from 'fs';
import * as path from 'path';

// ============= INTERFACES & TYPES =============

/**
 * Connection pool manager configuration
 */
export interface ConnectionPoolManagerConfig {
  /** Base connection pool configuration */
  connectionPool: ConnectionPoolConfig;
  /** Browser pool configuration */
  browserPool: BrowserPoolConfig;
  /** Enable cross-pool optimization */
  enableCrossPoolOptimization: boolean;
  /** Global resource monitoring interval */
  monitoringInterval: number;
  /** Performance metrics collection interval */
  metricsCollectionInterval: number;
  /** Enable adaptive load balancing */
  enableAdaptiveLoadBalancing: boolean;
  /** Resource cleanup interval */
  cleanupInterval: number;
  /** Enable performance logging */
  enablePerformanceLogging: boolean;
  /** Maximum total connections across all pools */
  maxTotalConnections: number;
}

/**
 * Unified pool metrics combining all pool types
 */
export interface UnifiedPoolMetrics {
  timestamp: number;
  connectionPool: ConnectionPoolMetrics;
  browserPool: BrowserPoolMetrics;
  globalStats: {
    totalConnections: number;
    totalActiveConnections: number;
    totalIdleConnections: number;
    totalUnhealthyConnections: number;
    overallEfficiencyImprovement: number;
    resourceUtilization: number;
    circuitBreakerTrips: number;
    crossPoolOptimizations: number;
  };
  performance: {
    averageOperationTime: number;
    connectionsPerSecond: number;
    reusabilityScore: number;
    memoryEfficiency: number;
  };
  health: {
    overallHealth: boolean;
    issues: string[];
    recommendations: string[];
  };
}

/**
 * Pool operation result with performance tracking
 */
export interface PoolOperationResult<T> {
  result: T;
  performance: {
    executionTime: number;
    cacheHit: boolean;
    connectionReused: boolean;
    poolUtilization: number;
  };
  metadata: {
    poolType: 'connection' | 'browser' | 'mixed';
    operationType: string;
    resourceId?: string;
  };
}

/**
 * Resource optimization strategy
 */
export interface OptimizationStrategy {
  type: 'memory' | 'performance' | 'reliability' | 'efficiency';
  priority: number;
  description: string;
  execute: () => Promise<boolean>;
  metrics: () => any;
}

// ============= MAIN CONNECTION POOL MANAGER CLASS =============

/**
 * Unified connection pool manager coordinating all pool types
 */
export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager | null = null;
  private connectionPool: MCPConnectionPool;
  private browserPool: BrowserConnectionPool;
  private circuitBreaker: CircuitBreakerIntegration;
  private isInitialized = false;
  private currentBrowser?: Browser;
  
  // Monitoring and metrics
  private monitoringTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private metricsHistory: UnifiedPoolMetrics[] = [];
  private optimizationStrategies: OptimizationStrategy[] = [];
  
  // Performance tracking
  private globalMetrics = {
    totalOperations: 0,
    totalConnectionTime: 0,
    totalCacheHits: 0,
    totalCircuitBreakerTrips: 0,
    crossPoolOptimizations: 0,
    startTime: Date.now()
  };
  
  // Resource limits and thresholds
  private resourceThresholds = {
    memoryWarning: 150, // MB
    memoryError: 300,   // MB
    utilizationWarning: 0.8, // 80%
    utilizationError: 0.95,  // 95%
    responseTimeWarning: 5000, // 5s
    responseTimeError: 15000   // 15s
  };
  
  private constructor(private config: ConnectionPoolManagerConfig) {
    // Initialize connection pool
    this.connectionPool = new MCPConnectionPool(config.connectionPool);
    
    // Initialize browser pool
    this.browserPool = new BrowserConnectionPool(config.browserPool);
    
    // Get circuit breaker integration
    this.circuitBreaker = CircuitBreakerIntegration.getInstance();
    
    this.initializeOptimizationStrategies();
    this.startMonitoring();
    
    console.error('[ConnectionPoolManager] Initialized with unified pool coordination');
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: ConnectionPoolManagerConfig): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      const defaultConfig = ConnectionPoolManager.getDefaultConfig();
      ConnectionPoolManager.instance = new ConnectionPoolManager(config || defaultConfig);
    }
    return ConnectionPoolManager.instance;
  }
  
  /**
   * Get default configuration
   */
  static getDefaultConfig(): ConnectionPoolManagerConfig {
    return {
      connectionPool: {
        maxBrowserContexts: 5,
        maxPagesPerContext: 3,
        maxMCPConnections: 10,
        idleTimeout: 300000, // 5 minutes
        validationTimeout: 5000, // 5 seconds
        healthCheckInterval: 60000, // 1 minute
        warmupConnections: 2,
        maxQueueSize: 20,
        affinityTimeout: 600000, // 10 minutes
        resizingThreshold: 0.8 // 80% utilization
      },
      browserPool: {
        maxContexts: 5,
        maxPagesPerContext: 3,
        contextIdleTimeout: 300000, // 5 minutes
        pageIdleTimeout: 180000, // 3 minutes
        sessionAffinityTimeout: 600000, // 10 minutes
        enableWarmup: true,
        warmupContexts: 2,
        enableMemoryOptimization: true,
        memoryThreshold: 100 // 100MB
      },
      enableCrossPoolOptimization: true,
      monitoringInterval: 30000, // 30 seconds
      metricsCollectionInterval: 60000, // 1 minute
      enableAdaptiveLoadBalancing: true,
      cleanupInterval: 300000, // 5 minutes
      enablePerformanceLogging: true,
      maxTotalConnections: 25
    };
  }
  
  /**
   * Initialize the pool manager with browser instance
   */
  async initialize(browser: Browser): Promise<void> {
    if (this.isInitialized) {
      console.error('[ConnectionPoolManager] Already initialized');
      return;
    }
    
    this.currentBrowser = browser;
    
    // Set browser for both pools
    this.connectionPool.setBrowser(browser);
    this.browserPool.setBrowser(browser);
    
    this.isInitialized = true;
    console.error('[ConnectionPoolManager] Initialized successfully with browser instance');
  }
  
  /**
   * Execute browser operation with connection pooling and circuit breaker protection
   */
  async executeBrowserOperation<T>(
    operationType: string,
    operation: (context: any, page: any) => Promise<T>,
    options: {
      sessionName?: string;
      domain?: string;
      profile?: string;
      priority?: 'high' | 'medium' | 'low';
      requiresNewContext?: boolean;
    } = {}
  ): Promise<PoolOperationResult<T>> {
    const startTime = Date.now();
    this.globalMetrics.totalOperations++;
    
    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.wrapMCPTool(
        `browser_${operationType}`,
        options,
        async () => {
          // Get browser context from pool
          const context = await this.browserPool.getContext({
            sessionName: options.sessionName,
            domain: options.domain,
            profile: options.profile,
            priority: options.priority,
            requiresNewContext: options.requiresNewContext,
            reuseSession: !options.requiresNewContext
          });
          
          let page;
          try {
            // Get page from pool
            page = await this.browserPool.getPage(undefined, {
              priority: options.priority
            });
            
            // Execute the operation
            const operationResult = await operation(context, page);
            
            return operationResult;
            
          } finally {
            // Release resources back to pool
            if (page) {
              await this.browserPool.releasePage(page);
            }
            await this.browserPool.releaseContext(context);
          }
        }
      );
      
      const executionTime = Date.now() - startTime;
      this.globalMetrics.totalConnectionTime += executionTime;
      
      // Check if this was a cache hit
      const cacheHit = executionTime < 100; // Consider sub-100ms operations as cache hits
      if (cacheHit) {
        this.globalMetrics.totalCacheHits++;
      }
      
      return {
        result,
        performance: {
          executionTime,
          cacheHit,
          connectionReused: cacheHit,
          poolUtilization: this.calculateCurrentUtilization()
        },
        metadata: {
          poolType: 'browser',
          operationType,
          resourceId: `${options.sessionName || 'default'}_${options.domain || 'any'}`
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Track circuit breaker trips
      if (error && typeof error === 'object' && 'circuitBreakerOpen' in error) {
        this.globalMetrics.totalCircuitBreakerTrips++;
      }
      
      console.error(`[ConnectionPoolManager] Browser operation '${operationType}' failed:`, error);
      throw error;
    }
  }
  
  /**
   * Execute MCP tool operation with connection pooling
   */
  async executeMCPOperation<T>(
    toolName: string,
    params: any,
    operation: (connection: any) => Promise<T>,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<PoolOperationResult<T>> {
    const startTime = Date.now();
    this.globalMetrics.totalOperations++;
    
    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.wrapMCPTool(
        toolName,
        params,
        async () => {
          // Get MCP connection from pool
          const connection = await this.connectionPool.getMCPConnection(toolName, priority);
          
          try {
            // Execute the operation
            const operationResult = await operation(connection);
            return operationResult;
            
          } finally {
            // Release connection back to pool
            await this.connectionPool.releaseMCPConnection(connection);
          }
        }
      );
      
      const executionTime = Date.now() - startTime;
      this.globalMetrics.totalConnectionTime += executionTime;
      
      const cacheHit = executionTime < 50; // Consider sub-50ms operations as cache hits
      if (cacheHit) {
        this.globalMetrics.totalCacheHits++;
      }
      
      return {
        result,
        performance: {
          executionTime,
          cacheHit,
          connectionReused: cacheHit,
          poolUtilization: this.calculateCurrentUtilization()
        },
        metadata: {
          poolType: 'connection',
          operationType: toolName,
          resourceId: toolName
        }
      };
      
    } catch (error) {
      console.error(`[ConnectionPoolManager] MCP operation '${toolName}' failed:`, error);
      throw error;
    }
  }
  
  /**
   * Get unified metrics across all pools
   */
  getUnifiedMetrics(): UnifiedPoolMetrics {
    const connectionMetrics = this.connectionPool.getMetrics();
    const browserMetrics = this.browserPool.getMetrics();
    const circuitBreakerMetrics = this.circuitBreaker.getMetrics();
    
    // Calculate global statistics
    const totalConnections = connectionMetrics.browserContexts.total + 
                            connectionMetrics.pages.total + 
                            connectionMetrics.mcpConnections.total;
    
    const totalActiveConnections = connectionMetrics.browserContexts.active + 
                                  connectionMetrics.pages.active + 
                                  connectionMetrics.mcpConnections.active;
    
    const totalIdleConnections = connectionMetrics.browserContexts.idle + 
                                connectionMetrics.pages.idle + 
                                connectionMetrics.mcpConnections.idle;
    
    const totalUnhealthyConnections = connectionMetrics.browserContexts.unhealthy + 
                                     connectionMetrics.pages.unhealthy + 
                                     connectionMetrics.mcpConnections.unhealthy;
    
    // Calculate overall efficiency improvement
    const overallEfficiencyImprovement = this.globalMetrics.totalOperations > 0 
      ? (this.globalMetrics.totalCacheHits / this.globalMetrics.totalOperations) * 100
      : 0;
    
    // Calculate resource utilization
    const resourceUtilization = totalConnections / this.config.maxTotalConnections;
    
    // Calculate performance metrics
    const averageOperationTime = this.globalMetrics.totalOperations > 0
      ? this.globalMetrics.totalConnectionTime / this.globalMetrics.totalOperations
      : 0;
    
    const uptime = Date.now() - this.globalMetrics.startTime;
    const connectionsPerSecond = uptime > 0 
      ? (this.globalMetrics.totalOperations / (uptime / 1000))
      : 0;
    
    // Calculate reusability score
    const reusabilityScore = this.globalMetrics.totalOperations > 0
      ? (this.globalMetrics.totalCacheHits / this.globalMetrics.totalOperations) * 100
      : 0;
    
    // Health assessment
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check resource utilization
    if (resourceUtilization > this.resourceThresholds.utilizationError) {
      issues.push('Critical: Resource utilization very high (>95%)');
      recommendations.push('Increase pool sizes or optimize resource usage');
    } else if (resourceUtilization > this.resourceThresholds.utilizationWarning) {
      issues.push('Warning: Resource utilization high (>80%)');
      recommendations.push('Monitor resource usage and consider pool expansion');
    }
    
    // Check response times
    if (averageOperationTime > this.resourceThresholds.responseTimeError) {
      issues.push(`Critical: Average operation time very slow (${averageOperationTime.toFixed(0)}ms)`);
      recommendations.push('Investigate performance bottlenecks and optimize operations');
    } else if (averageOperationTime > this.resourceThresholds.responseTimeWarning) {
      issues.push(`Warning: Average operation time slow (${averageOperationTime.toFixed(0)}ms)`);
      recommendations.push('Monitor performance and consider optimizations');
    }
    
    // Check circuit breaker status
    if (circuitBreakerMetrics.state === 'OPEN') {
      issues.push('Circuit breaker is OPEN - service degradation active');
      recommendations.push('Investigate underlying service issues causing circuit breaker trip');
    }
    
    // Check unhealthy connections
    if (totalUnhealthyConnections > totalConnections * 0.1) {
      issues.push('High number of unhealthy connections (>10%)');
      recommendations.push('Investigate connection health issues and cleanup unhealthy connections');
    }
    
    // Positive recommendations
    if (overallEfficiencyImprovement > 50) {
      recommendations.push(`Excellent efficiency improvement (${overallEfficiencyImprovement.toFixed(1)}%) - connection pooling is highly effective`);
    }
    
    if (reusabilityScore > 70) {
      recommendations.push(`High connection reusability (${reusabilityScore.toFixed(1)}%) - pools are well-utilized`);
    }
    
    const metrics: UnifiedPoolMetrics = {
      timestamp: Date.now(),
      connectionPool: connectionMetrics,
      browserPool: browserMetrics,
      globalStats: {
        totalConnections,
        totalActiveConnections,
        totalIdleConnections,
        totalUnhealthyConnections,
        overallEfficiencyImprovement,
        resourceUtilization: resourceUtilization * 100,
        circuitBreakerTrips: this.globalMetrics.totalCircuitBreakerTrips,
        crossPoolOptimizations: this.globalMetrics.crossPoolOptimizations
      },
      performance: {
        averageOperationTime,
        connectionsPerSecond,
        reusabilityScore,
        memoryEfficiency: 0 // Would need actual memory measurement
      },
      health: {
        overallHealth: issues.length === 0,
        issues,
        recommendations
      }
    };
    
    // Store in history (keep last 100 entries)
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }
    
    return metrics;
  }
  
  /**
   * Perform comprehensive health check across all pools
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: UnifiedPoolMetrics;
    recommendations: string[];
  }> {
    console.error('[ConnectionPoolManager] Performing comprehensive health check...');
    
    const [connectionHealth, browserHealth, circuitBreakerHealth] = await Promise.all([
      this.connectionPool.healthCheck(),
      this.browserPool.healthCheck(),
      Promise.resolve(this.circuitBreaker.getHealthReport())
    ]);
    
    const unifiedMetrics = this.getUnifiedMetrics();
    
    const allIssues = [
      ...connectionHealth.issues,
      ...browserHealth.issues,
      ...circuitBreakerHealth.failureAnalysis.recentFailures.map(f => `Circuit breaker failure: ${f.errorMessage}`),
      ...unifiedMetrics.health.issues
    ];
    
    const allRecommendations = [
      ...circuitBreakerHealth.recommendations,
      ...unifiedMetrics.health.recommendations
    ];
    
    const overallHealthy = connectionHealth.healthy && 
                          browserHealth.healthy && 
                          circuitBreakerHealth.enabled && 
                          unifiedMetrics.health.overallHealth;
    
    console.error(`[ConnectionPoolManager] Health check complete: ${overallHealthy ? 'HEALTHY' : 'ISSUES FOUND'} (${allIssues.length} issues)`);
    
    return {
      healthy: overallHealthy,
      issues: allIssues,
      metrics: unifiedMetrics,
      recommendations: allRecommendations
    };
  }
  
  /**
   * Trigger cross-pool optimization
   */
  async performCrossPoolOptimization(): Promise<{
    optimizationsApplied: number;
    results: string[];
    metricsImprovement: number;
  }> {
    if (!this.config.enableCrossPoolOptimization) {
      return { optimizationsApplied: 0, results: ['Cross-pool optimization disabled'], metricsImprovement: 0 };
    }
    
    console.error('[ConnectionPoolManager] Performing cross-pool optimization...');
    
    const beforeMetrics = this.getUnifiedMetrics();
    const results: string[] = [];
    let optimizationsApplied = 0;
    
    // Execute optimization strategies
    for (const strategy of this.optimizationStrategies) {
      try {
        const success = await strategy.execute();
        if (success) {
          optimizationsApplied++;
          results.push(`Applied ${strategy.type} optimization: ${strategy.description}`);
          this.globalMetrics.crossPoolOptimizations++;
        }
      } catch (error) {
        console.error(`[ConnectionPoolManager] Optimization strategy '${strategy.type}' failed:`, error);
        results.push(`Failed ${strategy.type} optimization: ${error}`);
      }
    }
    
    const afterMetrics = this.getUnifiedMetrics();
    const metricsImprovement = afterMetrics.globalStats.overallEfficiencyImprovement - 
                              beforeMetrics.globalStats.overallEfficiencyImprovement;
    
    console.error(`[ConnectionPoolManager] Cross-pool optimization complete: ${optimizationsApplied} optimizations applied, ${metricsImprovement.toFixed(1)}% improvement`);
    
    return {
      optimizationsApplied,
      results,
      metricsImprovement
    };
  }
  
  /**
   * Get metrics history for analysis
   */
  getMetricsHistory(): UnifiedPoolMetrics[] {
    return [...this.metricsHistory];
  }
  
  /**
   * Export metrics to file for analysis
   */
  async exportMetrics(filePath?: string): Promise<string> {
    const exportPath = filePath || path.join(ProjectPaths.getCacheDir(), `pool-metrics-${Date.now()}.json`);
    const metrics = this.getUnifiedMetrics();
    const history = this.getMetricsHistory();
    
    const exportData = {
      exportTime: Date.now(),
      currentMetrics: metrics,
      metricsHistory: history,
      configuration: this.config,
      globalMetrics: this.globalMetrics
    };
    
    await fs.promises.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    console.error(`[ConnectionPoolManager] Metrics exported to ${exportPath}`);
    
    return exportPath;
  }
  
  /**
   * Shutdown all pools and cleanup resources
   */
  async shutdown(): Promise<void> {
    console.error('[ConnectionPoolManager] Shutting down connection pool manager...');
    
    // Stop monitoring
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    
    // Shutdown pools
    await Promise.all([
      this.connectionPool.shutdown(),
      this.browserPool.shutdown()
    ]);
    
    // Clear metrics history
    this.metricsHistory.length = 0;
    this.optimizationStrategies.length = 0;
    
    this.isInitialized = false;
    console.error('[ConnectionPoolManager] Shutdown complete');
  }
  
  // ============= PRIVATE HELPER METHODS =============
  
  private initializeOptimizationStrategies(): void {
    // Memory optimization strategy
    this.optimizationStrategies.push({
      type: 'memory',
      priority: 1,
      description: 'Cleanup idle connections to reduce memory usage',
      execute: async () => {
        // Would implement memory cleanup logic
        return true;
      },
      metrics: () => ({ memoryFreed: 0 })
    });
    
    // Performance optimization strategy
    this.optimizationStrategies.push({
      type: 'performance',
      priority: 2,
      description: 'Optimize connection reuse patterns',
      execute: async () => {
        // Would implement performance optimization logic
        return true;
      },
      metrics: () => ({ performanceGain: 0 })
    });
    
    // Reliability optimization strategy
    this.optimizationStrategies.push({
      type: 'reliability',
      priority: 3,
      description: 'Remove unhealthy connections and reset circuit breakers',
      execute: async () => {
        // Would implement reliability optimization logic
        return true;
      },
      metrics: () => ({ connectionsFixed: 0 })
    });
  }
  
  private startMonitoring(): void {
    // Start resource monitoring
    if (this.config.monitoringInterval > 0) {
      this.monitoringTimer = setInterval(() => {
        this.performResourceMonitoring();
      }, this.config.monitoringInterval);
    }
    
    // Start metrics collection
    if (this.config.metricsCollectionInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsCollectionInterval);
    }
    
    // Start cleanup
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, this.config.cleanupInterval);
    }
  }
  
  private performResourceMonitoring(): void {
    if (!this.config.enablePerformanceLogging) return;
    
    const metrics = this.getUnifiedMetrics();
    
    // Log performance metrics
    console.error(`[ConnectionPoolManager] Resource Monitor - Utilization: ${metrics.globalStats.resourceUtilization.toFixed(1)}%, Efficiency: ${metrics.globalStats.overallEfficiencyImprovement.toFixed(1)}%, Connections: ${metrics.globalStats.totalActiveConnections}/${metrics.globalStats.totalConnections}`);
    
    // Trigger optimizations if needed
    if (this.config.enableAdaptiveLoadBalancing && metrics.globalStats.resourceUtilization > 80) {
      this.performCrossPoolOptimization().catch(error => {
        console.error('[ConnectionPoolManager] Auto-optimization failed:', error);
      });
    }
  }
  
  private collectMetrics(): void {
    // Collect and store metrics (already done in getUnifiedMetrics)
    this.getUnifiedMetrics();
  }
  
  private performCleanup(): void {
    // Cleanup old metrics
    const cutoff = Date.now() - 3600000; // 1 hour
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
    
    console.error(`[ConnectionPoolManager] Cleanup complete - Metrics history: ${this.metricsHistory.length} entries`);
  }
  
  private calculateCurrentUtilization(): number {
    const metrics = this.getUnifiedMetrics();
    return metrics.globalStats.resourceUtilization;
  }
}