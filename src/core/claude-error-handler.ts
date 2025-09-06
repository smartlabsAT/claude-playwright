/**
 * Claude-Aware Error Handling - Phase 3D Implementation
 * 
 * Provides intelligent error handling that translates technical errors into
 * Claude-friendly messages with actionable recovery suggestions.
 * 
 * Key Features:
 * - User-friendly error translation for Claude's responses
 * - Context-aware recovery action suggestions
 * - Integration with circuit breaker and connection pool status
 * - Fallback tool availability indication
 * - Performance-optimized error handling with minimal overhead
 * - Comprehensive error context collection
 */

import { ErrorClassifier, ErrorType, MCPCircuitBreaker, CircuitBreakerMetrics } from './circuit-breaker.js';
import { GracefulDegradationManager, DegradationLevel, DEGRADATION_LEVELS, UX_ENHANCEMENTS } from './graceful-degradation.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { CircuitBreakerIntegration } from './circuit-breaker-integration.js';

// ============= INTERFACES & TYPES =============

/**
 * Context information for error handling
 */
export interface ToolContext {
  toolName: string;
  operation: string;
  url?: string;
  selector?: string;
  parameters?: Record<string, any>;
  profile?: string;
  sessionName?: string;
  timestamp: number;
  retryCount?: number;
  totalDuration?: number;
}

/**
 * Claude-friendly error response
 */
export interface ErrorResponse {
  /** User-friendly error message suitable for Claude to relay to users */
  error: string;
  /** Actionable recovery suggestions the user can implement */
  suggestions: string[];
  /** Whether simplified fallback tools are available */
  fallbackAvailable: boolean;
  /** Whether this operation should be retried */
  canRetry: boolean;
  /** Current system degradation level */
  degradationLevel?: string;
  /** Estimated recovery time in human-readable format */
  estimatedRecovery?: string;
  /** Additional context for debugging (optional) */
  debugContext?: {
    originalError: string;
    errorType: ErrorType;
    circuitBreakerState: string;
    connectionPoolStatus: string;
    systemHealth: string;
  };
}

/**
 * Error pattern for intelligent suggestions
 */
interface ErrorPattern {
  pattern: RegExp;
  type: ErrorType;
  category: 'browser' | 'network' | 'element' | 'session' | 'system' | 'validation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoRetry: boolean;
  userMessage: string;
  suggestions: string[];
  expectedRecoveryTime: number; // milliseconds
}

/**
 * System health status for error context
 */
interface SystemHealthStatus {
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  degradationLevel: DegradationLevel;
  connectionPoolHealth: 'healthy' | 'degraded' | 'critical';
  failureRate: number;
  availableTools: number;
  totalTools: number;
  systemLoad: 'low' | 'medium' | 'high';
}

// ============= ERROR PATTERNS DEFINITION =============

/**
 * Comprehensive error patterns for intelligent classification
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Browser crash patterns
  {
    pattern: /browser.*(?:crash|disconnect|closed|not found|process|kill)/i,
    type: ErrorType.BROWSER_CRASH,
    category: 'browser',
    severity: 'high',
    autoRetry: true,
    userMessage: "Browser process crashed unexpectedly. The browser is restarting automatically.",
    suggestions: [
      "Please wait a moment while the browser restarts",
      "Try using simplified browser operations while the system recovers",
      "Close other applications if you're running low on memory"
    ],
    expectedRecoveryTime: 15000
  },
  
  // Network timeout patterns
  {
    pattern: /(?:timeout|network|connection.*timed.*out|request.*timeout|net::)/i,
    type: ErrorType.NETWORK_TIMEOUT,
    category: 'network',
    severity: 'medium',
    autoRetry: true,
    userMessage: "Network operation timed out. Your internet connection may be slow or interrupted.",
    suggestions: [
      "Check your internet connection stability",
      "Try the operation again in a few moments",
      "Consider using cached operations if available"
    ],
    expectedRecoveryTime: 30000
  },
  
  // Element not found patterns
  {
    pattern: /(?:element.*not.*found|selector.*not.*found|no.*element|element.*not.*visible|timeout.*waiting)/i,
    type: ErrorType.ELEMENT_NOT_FOUND,
    category: 'element',
    severity: 'medium',
    autoRetry: true,
    userMessage: "Could not find the requested element on the page. The page structure may have changed or still be loading.",
    suggestions: [
      "Wait a moment for the page to fully load before trying again",
      "Try using a different, more specific selector",
      "Verify the page has loaded completely with a screenshot"
    ],
    expectedRecoveryTime: 5000
  },
  
  // Memory pressure patterns
  {
    pattern: /(?:memory|heap|out.*of.*memory|allocation.*failed|resource.*exhausted)/i,
    type: ErrorType.MEMORY_PRESSURE,
    category: 'system',
    severity: 'high',
    autoRetry: false,
    userMessage: "System is under memory pressure. Available memory is running low.",
    suggestions: [
      "Close other applications to free up memory",
      "Restart the browser session to clear memory leaks",
      "Use simplified operations that require less memory"
    ],
    expectedRecoveryTime: 60000
  },
  
  // Connection failure patterns
  {
    pattern: /(?:connection.*(?:refused|failed|reset)|econnrefused|econnreset|connect.*error)/i,
    type: ErrorType.CONNECTION_FAILURE,
    category: 'network',
    severity: 'high',
    autoRetry: true,
    userMessage: "Failed to establish connection to the target server. The server may be temporarily unavailable.",
    suggestions: [
      "Verify the server is running and accessible",
      "Check if the URL is correct and reachable",
      "Try connecting again after a brief wait"
    ],
    expectedRecoveryTime: 12000
  },
  
  // Validation error patterns
  {
    pattern: /(?:validation|invalid.*parameter|malformed|parse.*error|schema.*error)/i,
    type: ErrorType.VALIDATION_ERROR,
    category: 'validation',
    severity: 'low',
    autoRetry: false,
    userMessage: "Invalid parameters or data format provided. Please check your input values.",
    suggestions: [
      "Verify all required parameters are provided",
      "Check that parameter values match expected formats",
      "Review the tool documentation for correct usage"
    ],
    expectedRecoveryTime: 0
  },
  
  // Session errors
  {
    pattern: /(?:session.*(?:not.*found|expired|invalid)|authentication.*(?:failed|required)|login.*required)/i,
    type: ErrorType.CONNECTION_FAILURE,
    category: 'session',
    severity: 'medium',
    autoRetry: true,
    userMessage: "Browser session expired or authentication is required. You may need to log in again.",
    suggestions: [
      "Try restoring your saved session if available",
      "Log in manually through the browser",
      "Save a new session after successful authentication"
    ],
    expectedRecoveryTime: 30000
  },
  
  // Permission/security errors
  {
    pattern: /(?:permission.*denied|access.*denied|security.*error|cors.*error|blocked.*by.*policy)/i,
    type: ErrorType.NON_RETRIABLE,
    category: 'validation',
    severity: 'medium',
    autoRetry: false,
    userMessage: "Access was denied due to security or permission restrictions.",
    suggestions: [
      "Check if the operation requires special permissions",
      "Verify you're logged in with appropriate credentials",
      "Try accessing the resource through the normal user interface first"
    ],
    expectedRecoveryTime: 0
  },
  
  // Page navigation errors
  {
    pattern: /(?:navigation.*(?:failed|timeout)|page.*not.*found|dns.*(?:error|failure)|net::err_name_not_resolved)/i,
    type: ErrorType.NETWORK_TIMEOUT,
    category: 'network',
    severity: 'medium',
    autoRetry: true,
    userMessage: "Failed to navigate to the requested page. The URL may be incorrect or the server may be down.",
    suggestions: [
      "Verify the URL is correct and accessible",
      "Check your internet connection",
      "Try accessing the page directly in a browser first"
    ],
    expectedRecoveryTime: 15000
  }
];

/**
 * Fallback tool mappings for degraded functionality
 */
const FALLBACK_TOOL_MAPPINGS: Record<string, string> = {
  'mcp__playwright__mcp_browser_click': 'browser_click',
  'mcp__playwright__mcp_browser_type': 'browser_type', 
  'mcp__playwright__mcp_browser_navigate': 'browser_navigate',
  'mcp__playwright__mcp_browser_screenshot': 'browser_screenshot',
  'mcp__playwright__mcp_browser_snapshot': 'browser_snapshot',
  'mcp__playwright__mcp_browser_fill_form': 'browser_fill_form',
  'mcp__playwright__mcp_browser_hover': 'browser_hover',
  'mcp__playwright__mcp_browser_select_option': 'browser_select_option',
  'mcp__playwright__mcp_browser_press_key': 'browser_press_key',
  'mcp__playwright__mcp_session_restore': 'browser_session_restore',
  'mcp__playwright__mcp_session_save': 'browser_session_save',
  'mcp__playwright__mcp_test_run': 'browser_run_test',
  'mcp__playwright__mcp_test_save': 'browser_save_test'
};

// ============= MAIN CLAUDE ERROR HANDLER CLASS =============

/**
 * Main Claude-aware error handler with intelligent error translation
 */
export class ClaudeErrorHandler {
  private static instance: ClaudeErrorHandler | null = null;
  private circuitBreakerIntegration: CircuitBreakerIntegration;
  private degradationManager: GracefulDegradationManager;
  private connectionPoolManager: ConnectionPoolManager;
  
  // Performance tracking
  private handledErrors = 0;
  private totalHandlingTime = 0;
  private errorTypeDistribution = new Map<ErrorType, number>();
  
  private constructor() {
    this.circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
    this.degradationManager = GracefulDegradationManager.getInstance();
    this.connectionPoolManager = ConnectionPoolManager.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ClaudeErrorHandler {
    if (!ClaudeErrorHandler.instance) {
      ClaudeErrorHandler.instance = new ClaudeErrorHandler();
    }
    return ClaudeErrorHandler.instance;
  }
  
  /**
   * Handle error with Claude-aware response generation
   */
  async handleError(error: Error | unknown, context: ToolContext): Promise<ErrorResponse> {
    const startTime = Date.now();
    
    try {
      // Classify the error
      const classification = ErrorClassifier.classifyError(error);
      const errorPattern = this.matchErrorPattern(error);
      const systemHealth = await this.getSystemHealthStatus();
      
      // Track error statistics
      this.handledErrors++;
      this.errorTypeDistribution.set(classification.type, 
        (this.errorTypeDistribution.get(classification.type) || 0) + 1
      );
      
      // Generate Claude-friendly error message
      const claudeMessage = this.translateErrorForClaude(error, errorPattern, context);
      
      // Generate recovery suggestions
      const suggestions = this.suggestRecoveryActions(error, context, classification, systemHealth);
      
      // Check fallback availability
      const fallbackAvailable = this.hasFallbackTool(context.toolName);
      
      // Determine retry capability
      const canRetry = this.isRetryableError(error, classification, context);
      
      // Get recovery time estimate
      const estimatedRecovery = this.getRecoveryTimeEstimate(classification, errorPattern, systemHealth);
      
      // Build response
      const response: ErrorResponse = {
        error: claudeMessage,
        suggestions,
        fallbackAvailable,
        canRetry,
        degradationLevel: this.getDegradationLevelDescription(systemHealth.degradationLevel),
        estimatedRecovery: estimatedRecovery ? this.formatRecoveryTime(estimatedRecovery) : undefined
      };
      
      // Add debug context in development/debug mode
      if (process.env.DEBUG_CLAUDE_ERRORS === 'true') {
        response.debugContext = {
          originalError: error instanceof Error ? error.message : String(error),
          errorType: classification.type,
          circuitBreakerState: systemHealth.circuitBreakerState,
          connectionPoolStatus: systemHealth.connectionPoolHealth,
          systemHealth: `${systemHealth.systemLoad} load, ${(systemHealth.failureRate * 100).toFixed(1)}% failure rate`
        };
      }
      
      // Log for monitoring (to stderr to avoid JSON-RPC interference)
      console.error(`[ClaudeErrorHandler] ${context.toolName} error handled: ${claudeMessage.substring(0, 100)}...`);
      
      return response;
      
    } finally {
      // Track performance
      this.totalHandlingTime += Date.now() - startTime;
    }
  }
  
  /**
   * Get error handling performance metrics
   */
  getMetrics(): {
    handledErrors: number;
    averageHandlingTime: number;
    errorTypeDistribution: Record<ErrorType, number>;
    systemHealth: SystemHealthStatus;
  } {
    const averageHandlingTime = this.handledErrors > 0 
      ? this.totalHandlingTime / this.handledErrors 
      : 0;
    
    return {
      handledErrors: this.handledErrors,
      averageHandlingTime,
      errorTypeDistribution: Object.fromEntries(this.errorTypeDistribution),
      systemHealth: this.getSystemHealthStatusSync()
    };
  }
  
  // ============= PRIVATE HELPER METHODS =============
  
  /**
   * Translate technical error to Claude-friendly message
   */
  private translateErrorForClaude(
    error: Error | unknown, 
    pattern: ErrorPattern | null, 
    context: ToolContext
  ): string {
    // Use pattern-based message if available
    if (pattern) {
      return pattern.userMessage;
    }
    
    // Fallback to error type-based messages
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Browser-related errors
    if (errorMessage.includes('browser') || errorMessage.includes('playwright')) {
      return "Browser operation failed. The browser may need to restart or the page may be unresponsive.";
    }
    
    // Network-related errors
    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      return "Network operation failed. Your connection may be slow or the server may be temporarily unavailable.";
    }
    
    // Element interaction errors
    if (errorMessage.includes('element') || errorMessage.includes('selector')) {
      return "Could not interact with the page element. The element may not be available or the page may still be loading.";
    }
    
    // Session/authentication errors
    if (errorMessage.includes('session') || errorMessage.includes('auth') || errorMessage.includes('login')) {
      return "Session or authentication issue. You may need to log in again or restore your saved session.";
    }
    
    // Generic fallback
    return `Operation failed: ${this.sanitizeErrorMessage(error)}. Please try again or use alternative approaches.`;
  }
  
  /**
   * Generate context-aware recovery suggestions
   */
  private suggestRecoveryActions(
    error: Error | unknown,
    context: ToolContext,
    classification: { type: ErrorType; retriable: boolean; shouldTrip: boolean },
    systemHealth: SystemHealthStatus
  ): string[] {
    const suggestions: string[] = [];
    const pattern = this.matchErrorPattern(error);
    
    // Start with pattern-specific suggestions
    if (pattern) {
      suggestions.push(...pattern.suggestions);
    }
    
    // Add system health-based suggestions
    if (systemHealth.degradationLevel !== 'LEVEL_1') {
      const uxEnhancement = UX_ENHANCEMENTS[systemHealth.degradationLevel];
      suggestions.push(...uxEnhancement.suggestions.alternatives);
      suggestions.push(...uxEnhancement.suggestions.workarounds);
    }
    
    // Add fallback tool suggestions
    if (this.hasFallbackTool(context.toolName)) {
      const fallbackTool = FALLBACK_TOOL_MAPPINGS[context.toolName];
      suggestions.push(`Try using the simplified version of this tool (${fallbackTool})`);
    }
    
    // Add retry suggestions for retriable errors
    if (classification.retriable && context.retryCount === undefined || (context.retryCount ?? 0) < 3) {
      suggestions.push("Wait a moment and try the operation again");
    }
    
    // Add session-specific suggestions
    if (context.sessionName) {
      suggestions.push("Try restoring your browser session if authentication is required");
    }
    
    // Add circuit breaker-specific suggestions
    if (systemHealth.circuitBreakerState === 'OPEN') {
      const metrics = this.circuitBreakerIntegration.getMetrics();
      if (metrics.nextRetryTime) {
        const waitTime = Math.max(0, metrics.nextRetryTime - Date.now());
        suggestions.push(`System is recovering - try again in ${this.formatRecoveryTime(waitTime)}`);
      }
    }
    
    // Add performance suggestions based on system load
    if (systemHealth.systemLoad === 'high') {
      suggestions.push("Close other applications to improve system performance");
      suggestions.push("Use simplified operations while the system is under load");
    }
    
    // Connection pool suggestions
    if (systemHealth.connectionPoolHealth === 'critical') {
      suggestions.push("Browser connections are being reset - operations may be slower temporarily");
    }
    
    // Remove duplicates and limit to most relevant suggestions
    const uniqueSuggestions = Array.from(new Set(suggestions));
    return uniqueSuggestions.slice(0, 5); // Limit to 5 most relevant suggestions
  }
  
  /**
   * Check if a fallback tool is available
   */
  private hasFallbackTool(toolName: string): boolean {
    return toolName in FALLBACK_TOOL_MAPPINGS;
  }
  
  /**
   * Determine if error is retriable based on context
   */
  private isRetryableError(
    error: Error | unknown,
    classification: { type: ErrorType; retriable: boolean; shouldTrip: boolean },
    context: ToolContext
  ): boolean {
    // Don't retry if we've already tried too many times
    if ((context.retryCount ?? 0) >= 3) {
      return false;
    }
    
    // Don't retry validation errors
    if (classification.type === ErrorType.VALIDATION_ERROR) {
      return false;
    }
    
    // Don't retry if circuit breaker is open and not allowing retries
    const systemHealth = this.getSystemHealthStatusSync();
    if (systemHealth.circuitBreakerState === 'OPEN') {
      const metrics = this.circuitBreakerIntegration.getMetrics();
      return metrics.nextRetryTime !== undefined && Date.now() >= metrics.nextRetryTime;
    }
    
    // Don't retry memory pressure issues immediately
    if (classification.type === ErrorType.MEMORY_PRESSURE) {
      return false;
    }
    
    // Default to classification result
    return classification.retriable;
  }
  
  /**
   * Match error against known patterns
   */
  private matchErrorPattern(error: Error | unknown): ErrorPattern | null {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(errorMessage)) {
        return pattern;
      }
    }
    
    return null;
  }
  
  /**
   * Get system health status for error context
   */
  private async getSystemHealthStatus(): Promise<SystemHealthStatus> {
    try {
      const circuitBreakerMetrics = this.circuitBreakerIntegration.getMetrics();
      const degradationStatus = this.degradationManager.getDegradationStatus();
      const connectionPoolStatus = this.connectionPoolManager.getHealthStatus();
      
      // Calculate available vs total tools
      const currentLevelConfig = DEGRADATION_LEVELS[degradationStatus.level];
      const totalTools = DEGRADATION_LEVELS.LEVEL_1.tools.length;
      const availableTools = currentLevelConfig.tools.length;
      
      // Determine system load based on failure rate and degradation
      let systemLoad: 'low' | 'medium' | 'high' = 'low';
      if (circuitBreakerMetrics.failureRate > 0.3 || degradationStatus.level === 'LEVEL_3' || degradationStatus.level === 'LEVEL_4') {
        systemLoad = 'high';
      } else if (circuitBreakerMetrics.failureRate > 0.1 || degradationStatus.level === 'LEVEL_2') {
        systemLoad = 'medium';
      }
      
      // Determine connection pool health
      let connectionPoolHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
      if (connectionPoolStatus.unhealthyConnections > connectionPoolStatus.totalConnections * 0.5) {
        connectionPoolHealth = 'critical';
      } else if (connectionPoolStatus.unhealthyConnections > 0) {
        connectionPoolHealth = 'degraded';
      }
      
      return {
        circuitBreakerState: circuitBreakerMetrics.state,
        degradationLevel: degradationStatus.level,
        connectionPoolHealth,
        failureRate: circuitBreakerMetrics.failureRate,
        availableTools,
        totalTools,
        systemLoad
      };
    } catch (error) {
      console.error('[ClaudeErrorHandler] Error getting system health status:', error);
      // Return safe defaults
      return {
        circuitBreakerState: 'CLOSED',
        degradationLevel: 'LEVEL_1',
        connectionPoolHealth: 'healthy',
        failureRate: 0,
        availableTools: 20,
        totalTools: 20,
        systemLoad: 'low'
      };
    }
  }
  
  /**
   * Synchronous version of getSystemHealthStatus (cached/approximated)
   */
  private getSystemHealthStatusSync(): SystemHealthStatus {
    try {
      const circuitBreakerMetrics = this.circuitBreakerIntegration.getMetrics();
      const degradationStatus = this.degradationManager.getDegradationStatus();
      
      // Use cached/approximated values for sync operation
      return {
        circuitBreakerState: circuitBreakerMetrics.state,
        degradationLevel: degradationStatus.level,
        connectionPoolHealth: 'healthy', // Simplified for sync operation
        failureRate: circuitBreakerMetrics.failureRate,
        availableTools: DEGRADATION_LEVELS[degradationStatus.level].tools.length,
        totalTools: DEGRADATION_LEVELS.LEVEL_1.tools.length,
        systemLoad: circuitBreakerMetrics.failureRate > 0.2 ? 'high' : 'low'
      };
    } catch (error) {
      return {
        circuitBreakerState: 'CLOSED',
        degradationLevel: 'LEVEL_1',
        connectionPoolHealth: 'healthy',
        failureRate: 0,
        availableTools: 20,
        totalTools: 20,
        systemLoad: 'low'
      };
    }
  }
  
  /**
   * Get estimated recovery time for error type
   */
  private getRecoveryTimeEstimate(
    classification: { type: ErrorType; retriable: boolean; shouldTrip: boolean },
    pattern: ErrorPattern | null,
    systemHealth: SystemHealthStatus
  ): number | null {
    // Use pattern-specific recovery time if available
    if (pattern) {
      return pattern.expectedRecoveryTime;
    }
    
    // Use circuit breaker recovery time if available
    if (systemHealth.circuitBreakerState === 'OPEN') {
      const metrics = this.circuitBreakerIntegration.getMetrics();
      if (metrics.nextRetryTime) {
        return Math.max(0, metrics.nextRetryTime - Date.now());
      }
    }
    
    // Use degradation level recovery time
    const degradationConfig = DEGRADATION_LEVELS[systemHealth.degradationLevel];
    if (degradationConfig.recoveryTime > 0) {
      return degradationConfig.recoveryTime;
    }
    
    // Default recovery times by error type
    const defaultRecoveryTimes: Record<ErrorType, number> = {
      [ErrorType.BROWSER_CRASH]: 15000,
      [ErrorType.NETWORK_TIMEOUT]: 30000,
      [ErrorType.ELEMENT_NOT_FOUND]: 5000,
      [ErrorType.MEMORY_PRESSURE]: 60000,
      [ErrorType.CONNECTION_FAILURE]: 12000,
      [ErrorType.VALIDATION_ERROR]: 0,
      [ErrorType.RETRIABLE]: 5000,
      [ErrorType.NON_RETRIABLE]: 0,
      [ErrorType.UNKNOWN]: 10000
    };
    
    return defaultRecoveryTimes[classification.type] || 0;
  }
  
  /**
   * Format recovery time for human readability
   */
  private formatRecoveryTime(milliseconds: number): string {
    if (milliseconds === 0) return 'immediately';
    if (milliseconds < 1000) return 'less than a second';
    if (milliseconds < 60000) return `${Math.round(milliseconds / 1000)} seconds`;
    if (milliseconds < 3600000) return `${Math.round(milliseconds / 60000)} minutes`;
    return `${Math.round(milliseconds / 3600000)} hours`;
  }
  
  /**
   * Get user-friendly description of degradation level
   */
  private getDegradationLevelDescription(level: DegradationLevel): string {
    const uxEnhancement = UX_ENHANCEMENTS[level];
    return `${uxEnhancement.messaging.title} - ${uxEnhancement.messaging.description}`;
  }
  
  /**
   * Sanitize error message for user display
   */
  private sanitizeErrorMessage(error: Error | unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    
    // Remove technical stack traces and internal paths
    let sanitized = message
      .replace(/at .+?\(.+?\)/g, '') // Remove stack trace lines
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Truncate very long messages
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 197) + '...';
    }
    
    return sanitized;
  }
}

/**
 * Convenience function for MCP tools to handle errors with Claude-aware responses
 */
export async function handleToolError(
  error: Error | unknown,
  toolName: string,
  operation: string,
  additionalContext: Partial<ToolContext> = {}
): Promise<ErrorResponse> {
  const handler = ClaudeErrorHandler.getInstance();
  
  const context: ToolContext = {
    toolName,
    operation,
    timestamp: Date.now(),
    ...additionalContext
  };
  
  return await handler.handleError(error, context);
}

/**
 * Export the singleton instance for direct use
 */
export const claudeErrorHandler = ClaudeErrorHandler.getInstance();