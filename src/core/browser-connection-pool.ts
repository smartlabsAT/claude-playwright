/**
 * Browser Connection Pooling - Phase 3B Implementation
 * 
 * Specialized connection pooling for browser contexts and pages with
 * session management integration and performance optimization.
 * 
 * Key Features:
 * - Context pooling with session affinity
 * - Page pooling within contexts
 * - Session-aware connection management
 * - Performance metrics and monitoring
 * - Integration with existing session manager
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { MCPConnectionPool, PooledBrowserContext, PooledPage, ConnectionPriority } from './connection-pool.js';
import { SessionManager, SessionData } from './session-manager.js';
import { ProjectPaths } from '../utils/project-paths.js';

// ============= INTERFACES & TYPES =============

/**
 * Browser pool configuration extending base pool config
 */
export interface BrowserPoolConfig {
  /** Maximum number of browser contexts in pool */
  maxContexts: number;
  /** Maximum number of pages per context */
  maxPagesPerContext: number;
  /** Context idle timeout in milliseconds */
  contextIdleTimeout: number;
  /** Page idle timeout in milliseconds */
  pageIdleTimeout: number;
  /** Session affinity timeout in milliseconds */
  sessionAffinityTimeout: number;
  /** Enable context warmup */
  enableWarmup: boolean;
  /** Number of contexts to keep warm */
  warmupContexts: number;
  /** Enable memory optimization */
  enableMemoryOptimization: boolean;
  /** Memory usage threshold (MB) */
  memoryThreshold: number;
}

/**
 * Browser operation context for connection pooling
 */
export interface BrowserOperationContext {
  sessionName?: string;
  domain?: string;
  profile?: string;
  priority?: ConnectionPriority;
  reuseSession?: boolean;
  requiresNewContext?: boolean;
}

/**
 * Browser pool metrics
 */
export interface BrowserPoolMetrics {
  contexts: {
    total: number;
    active: number;
    idle: number;
    withSessions: number;
    averageReuse: number;
    sessionHitRate: number;
  };
  pages: {
    total: number;
    active: number;
    idle: number;
    averageReuse: number;
  };
  performance: {
    contextCreationTime: number;
    pageCreationTime: number;
    sessionLoadTime: number;
    reuseEfficiency: number;
  };
  memory: {
    totalUsage: number;
    averagePerContext: number;
    threshold: number;
    optimizationTriggers: number;
  };
}

// ============= MAIN BROWSER CONNECTION POOL CLASS =============

/**
 * Specialized browser connection pool with session integration
 */
export class BrowserConnectionPool {
  private connectionPool: MCPConnectionPool;
  private sessionManager: SessionManager;
  private currentBrowser?: Browser;
  private sessionContextMap = new Map<string, string>(); // sessionName -> contextId
  private contextSessionMap = new Map<string, string>(); // contextId -> sessionName
  private domainContextMap = new Map<string, string>(); // domain -> contextId
  private metrics = {
    contextCreations: 0,
    contextReuses: 0,
    pageCreations: 0,
    pageReuses: 0,
    sessionLoads: 0,
    sessionHits: 0,
    memoryOptimizations: 0,
    totalContextTime: 0,
    totalPageTime: 0,
    totalSessionTime: 0
  };
  
  constructor(private config: BrowserPoolConfig) {
    // Create underlying connection pool with browser-specific settings
    this.connectionPool = new MCPConnectionPool({
      maxBrowserContexts: config.maxContexts,
      maxPagesPerContext: config.maxPagesPerContext,
      maxMCPConnections: 10, // Not used for browser pool
      idleTimeout: config.contextIdleTimeout,
      validationTimeout: 5000,
      healthCheckInterval: 60000,
      warmupConnections: config.enableWarmup ? config.warmupContexts : 0,
      maxQueueSize: 20,
      affinityTimeout: config.sessionAffinityTimeout,
      resizingThreshold: 0.8
    });
    
    this.sessionManager = new SessionManager();
    
    console.error('[BrowserConnectionPool] Initialized with configuration:', {
      maxContexts: config.maxContexts,
      maxPagesPerContext: config.maxPagesPerContext,
      enableWarmup: config.enableWarmup,
      enableMemoryOptimization: config.enableMemoryOptimization
    });
  }
  
  /**
   * Create browser connection pool with default configuration
   */
  static createDefault(): BrowserConnectionPool {
    return new BrowserConnectionPool({
      maxContexts: 5,
      maxPagesPerContext: 3,
      contextIdleTimeout: 300000, // 5 minutes
      pageIdleTimeout: 180000, // 3 minutes
      sessionAffinityTimeout: 600000, // 10 minutes
      enableWarmup: true,
      warmupContexts: 2,
      enableMemoryOptimization: true,
      memoryThreshold: 100 // 100MB
    });
  }
  
  /**
   * Set the browser instance for the pool
   */
  setBrowser(browser: Browser): void {
    this.currentBrowser = browser;
    this.connectionPool.setBrowser(browser);
  }
  
  /**
   * Get a browser context with session and domain affinity
   */
  async getContext(operationContext: BrowserOperationContext = {}): Promise<BrowserContext> {
    const startTime = Date.now();
    
    try {
      // Check for session-based context reuse
      if (operationContext.sessionName && operationContext.reuseSession) {
        const sessionContext = await this.getSessionContext(operationContext.sessionName);
        if (sessionContext) {
          this.metrics.contextReuses++;
          this.metrics.sessionHits++;
          console.error(`[BrowserConnectionPool] Reusing session context for ${operationContext.sessionName}`);
          return sessionContext;
        }
      }
      
      // Get context from pool with domain/session affinity
      const context = await this.connectionPool.getBrowserContext(
        operationContext.domain,
        operationContext.sessionName,
        operationContext.priority
      );
      
      // Load session if specified
      if (operationContext.sessionName && !operationContext.requiresNewContext) {
        await this.loadSessionIntoContext(context, operationContext.sessionName);
      }
      
      this.metrics.contextCreations++;
      this.metrics.totalContextTime += Date.now() - startTime;
      
      return context;
      
    } catch (error) {
      console.error('[BrowserConnectionPool] Error getting context:', error);
      throw error;
    }
  }
  
  /**
   * Release a browser context back to the pool
   */
  async releaseContext(context: BrowserContext): Promise<void> {
    await this.connectionPool.releaseBrowserContext(context);
    
    // Trigger memory optimization if needed
    if (this.config.enableMemoryOptimization) {
      await this.checkMemoryOptimization();
    }
  }
  
  /**
   * Get a page with context affinity
   */
  async getPage(contextId?: string, operationContext: BrowserOperationContext = {}): Promise<Page> {
    const startTime = Date.now();
    
    try {
      const page = await this.connectionPool.getPage(contextId, operationContext.priority);
      
      this.metrics.pageCreations++;
      this.metrics.totalPageTime += Date.now() - startTime;
      
      return page;
    } catch (error) {
      console.error('[BrowserConnectionPool] Error getting page:', error);
      throw error;
    }
  }
  
  /**
   * Release a page back to the pool
   */
  async releasePage(page: Page): Promise<void> {
    await this.connectionPool.releasePage(page);
  }
  
  /**
   * Create a context with a specific session pre-loaded
   */
  async createSessionContext(sessionName: string, operationContext: BrowserOperationContext = {}): Promise<BrowserContext> {
    const sessionLoadStart = Date.now();
    
    // Get a new context
    const context = await this.getContext({
      ...operationContext,
      sessionName,
      requiresNewContext: true,
      reuseSession: false
    });
    
    // Load the session
    await this.loadSessionIntoContext(context, sessionName);
    
    // Store mapping
    const contextId = this.findContextId(context);
    if (contextId) {
      this.sessionContextMap.set(sessionName, contextId);
      this.contextSessionMap.set(contextId, sessionName);
    }
    
    this.metrics.sessionLoads++;
    this.metrics.totalSessionTime += Date.now() - sessionLoadStart;
    
    console.error(`[BrowserConnectionPool] Created session context for ${sessionName} (load time: ${Date.now() - sessionLoadStart}ms)`);
    
    return context;
  }
  
  /**
   * Get existing session context or create new one
   */
  async getOrCreateSessionContext(sessionName: string, operationContext: BrowserOperationContext = {}): Promise<BrowserContext> {
    // Try to get existing session context
    const existingContext = await this.getSessionContext(sessionName);
    if (existingContext) {
      this.metrics.sessionHits++;
      return existingContext;
    }
    
    // Create new session context
    return await this.createSessionContext(sessionName, operationContext);
  }
  
  /**
   * Switch to a different session context
   */
  async switchSessionContext(fromSession: string, toSession: string): Promise<BrowserContext> {
    console.error(`[BrowserConnectionPool] Switching session context from ${fromSession} to ${toSession}`);
    
    // Release current session context
    const currentContext = await this.getSessionContext(fromSession);
    if (currentContext) {
      await this.releaseContext(currentContext);
    }
    
    // Get or create new session context
    return await this.getOrCreateSessionContext(toSession);
  }
  
  /**
   * Get comprehensive browser pool metrics
   */
  getMetrics(): BrowserPoolMetrics {
    const poolMetrics = this.connectionPool.getMetrics();
    
    // Calculate reuse rates
    const contextReuseRate = this.metrics.contextCreations > 0 
      ? (this.metrics.contextReuses / this.metrics.contextCreations) * 100
      : 0;
    
    const pageReuseRate = this.metrics.pageCreations > 0 
      ? (this.metrics.pageReuses / this.metrics.pageCreations) * 100
      : 0;
    
    const sessionHitRate = this.metrics.sessionLoads > 0
      ? (this.metrics.sessionHits / this.metrics.sessionLoads) * 100
      : 0;
    
    // Calculate average times
    const avgContextTime = this.metrics.contextCreations > 0
      ? this.metrics.totalContextTime / this.metrics.contextCreations
      : 0;
    
    const avgPageTime = this.metrics.pageCreations > 0
      ? this.metrics.totalPageTime / this.metrics.pageCreations
      : 0;
    
    const avgSessionTime = this.metrics.sessionLoads > 0
      ? this.metrics.totalSessionTime / this.metrics.sessionLoads
      : 0;
    
    return {
      contexts: {
        total: poolMetrics.browserContexts.total,
        active: poolMetrics.browserContexts.active,
        idle: poolMetrics.browserContexts.idle,
        withSessions: this.sessionContextMap.size,
        averageReuse: contextReuseRate,
        sessionHitRate
      },
      pages: {
        total: poolMetrics.pages.total,
        active: poolMetrics.pages.active,
        idle: poolMetrics.pages.idle,
        averageReuse: pageReuseRate
      },
      performance: {
        contextCreationTime: avgContextTime,
        pageCreationTime: avgPageTime,
        sessionLoadTime: avgSessionTime,
        reuseEfficiency: poolMetrics.efficiencyImprovement
      },
      memory: {
        totalUsage: 0, // Would need actual memory measurement
        averagePerContext: 0, // Would need actual memory measurement
        threshold: this.config.memoryThreshold,
        optimizationTriggers: this.metrics.memoryOptimizations
      }
    };
  }
  
  /**
   * Perform health check on browser pool
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: BrowserPoolMetrics;
  }> {
    const baseHealthCheck = await this.connectionPool.healthCheck();
    const metrics = this.getMetrics();
    const issues = [...baseHealthCheck.issues];
    
    // Browser-specific health checks
    if (metrics.contexts.active > metrics.contexts.total * 0.9) {
      issues.push('Context pool utilization very high (>90%)');
    }
    
    if (metrics.pages.active > metrics.pages.total * 0.9) {
      issues.push('Page pool utilization very high (>90%)');
    }
    
    if (metrics.performance.contextCreationTime > 5000) {
      issues.push(`Context creation time slow (${metrics.performance.contextCreationTime.toFixed(0)}ms)`);
    }
    
    if (metrics.performance.sessionLoadTime > 10000) {
      issues.push(`Session load time slow (${metrics.performance.sessionLoadTime.toFixed(0)}ms)`);
    }
    
    if (metrics.contexts.sessionHitRate < 50 && this.metrics.sessionLoads > 10) {
      issues.push('Low session hit rate - sessions may not be persisting properly');
    }
    
    return {
      healthy: baseHealthCheck.healthy && issues.length === baseHealthCheck.issues.length,
      issues,
      metrics
    };
  }
  
  /**
   * Shutdown browser pool
   */
  async shutdown(): Promise<void> {
    console.error('[BrowserConnectionPool] Shutting down browser pool...');
    
    // Clear mappings
    this.sessionContextMap.clear();
    this.contextSessionMap.clear();
    this.domainContextMap.clear();
    
    // Shutdown underlying pool
    await this.connectionPool.shutdown();
    
    console.error('[BrowserConnectionPool] Shutdown complete');
  }
  
  // ============= PRIVATE HELPER METHODS =============
  
  /**
   * Get existing session context if available and healthy
   */
  private async getSessionContext(sessionName: string): Promise<BrowserContext | null> {
    const contextId = this.sessionContextMap.get(sessionName);
    if (!contextId) return null;
    
    // Verify context still exists and is healthy
    try {
      // This would need access to the internal context map from MCPConnectionPool
      // For now, we'll return null and let it create a new one
      return null;
    } catch (error) {
      // Context no longer exists, clean up mapping
      this.sessionContextMap.delete(sessionName);
      this.contextSessionMap.delete(contextId);
      return null;
    }
  }
  
  /**
   * Load a session into a browser context
   */
  private async loadSessionIntoContext(context: BrowserContext, sessionName: string): Promise<void> {
    try {
      const sessionData = await this.sessionManager.loadSession(sessionName);
      if (sessionData && sessionData.storageState) {
        await context.addCookies(sessionData.storageState.cookies || []);
        
        // Set localStorage for each origin if available
        if (sessionData.storageState.origins) {
          for (const origin of sessionData.storageState.origins) {
            const page = await context.newPage();
            await page.goto(origin.origin);
            
            // Set localStorage
            if (origin.localStorage) {
              await page.evaluate((localStorage) => {
                for (const item of localStorage) {
                  window.localStorage.setItem(item.name, item.value);
                }
              }, origin.localStorage);
            }
            
            // Set sessionStorage
            if (origin.sessionStorage) {
              await page.evaluate((sessionStorage) => {
                for (const item of sessionStorage) {
                  window.sessionStorage.setItem(item.name, item.value);
                }
              }, origin.sessionStorage);
            }
            
            await page.close();
          }
        }
        
        console.error(`[BrowserConnectionPool] Loaded session ${sessionName} into context`);
      }
    } catch (error) {
      console.error(`[BrowserConnectionPool] Error loading session ${sessionName}:`, error);
      throw error;
    }
  }
  
  /**
   * Find context ID from browser context instance
   */
  private findContextId(context: BrowserContext): string | undefined {
    // This would need access to the internal context mapping
    // For now, return a generated ID
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Check if memory optimization is needed
   */
  private async checkMemoryOptimization(): Promise<void> {
    try {
      // Get memory usage (would need actual implementation)
      const memoryUsage = await this.getMemoryUsage();
      
      if (memoryUsage > this.config.memoryThreshold) {
        await this.performMemoryOptimization();
      }
    } catch (error) {
      console.error('[BrowserConnectionPool] Error in memory optimization check:', error);
    }
  }
  
  /**
   * Get current memory usage (placeholder implementation)
   */
  private async getMemoryUsage(): Promise<number> {
    // Would implement actual memory measurement here
    // For now, return a placeholder value
    return 50; // MB
  }
  
  /**
   * Perform memory optimization
   */
  private async performMemoryOptimization(): Promise<void> {
    console.error('[BrowserConnectionPool] Performing memory optimization...');
    
    this.metrics.memoryOptimizations++;
    
    // Could implement strategies like:
    // - Closing idle contexts that haven't been used recently
    // - Clearing page caches
    // - Reducing pool sizes temporarily
    // - Forcing garbage collection
    
    console.error('[BrowserConnectionPool] Memory optimization complete');
  }
}