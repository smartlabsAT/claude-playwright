/**
 * Circuit Breaker Integration - Phase 3A Implementation
 * 
 * Integrates circuit breaker with existing MCP server tools to provide
 * graceful degradation and prevent cascading failures.
 */

import { MCPCircuitBreaker, CircuitBreakerOpenError, CircuitBreakerMetrics, ErrorClassifier } from './circuit-breaker.js';
import { handleToolError, ToolContext } from './claude-error-handler.js';

/**
 * Circuit breaker integration service
 */
export class CircuitBreakerIntegration {
  private static instance: CircuitBreakerIntegration | null = null;
  private circuitBreaker: MCPCircuitBreaker;
  private isEnabled: boolean = true;
  
  private constructor() {
    this.circuitBreaker = MCPCircuitBreaker.createDefault();
    console.error('[CircuitBreakerIntegration] Initialized with default configuration');
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): CircuitBreakerIntegration {
    if (!CircuitBreakerIntegration.instance) {
      CircuitBreakerIntegration.instance = new CircuitBreakerIntegration();
    }
    return CircuitBreakerIntegration.instance;
  }
  
  /**
   * Enable or disable circuit breaker
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.error(`[CircuitBreakerIntegration] Circuit breaker ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if circuit breaker is enabled
   */
  isCircuitBreakerEnabled(): boolean {
    return this.isEnabled;
  }
  
  /**
   * Wrap an MCP tool with circuit breaker protection
   */
  async wrapMCPTool<TParams, TResult>(
    toolName: string,
    params: TParams,
    operation: (params: TParams) => Promise<TResult>
  ): Promise<TResult> {
    if (!this.isEnabled) {
      // Circuit breaker disabled - execute normally
      return await operation(params);
    }
    
    try {
      return await this.circuitBreaker.execute(toolName, () => operation(params));
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        // Circuit breaker is open - return graceful degradation response
        return this.createCircuitBreakerOpenResponse(toolName, error) as TResult;
      }
      
      // Re-throw other errors
      throw error;
    }
  }
  
  /**
   * Create a graceful degradation response when circuit breaker is open
   */
  private createCircuitBreakerOpenResponse(toolName: string, error: CircuitBreakerOpenError): any {
    const metrics = this.circuitBreaker.getMetrics();
    const nextRetryTime = metrics.nextRetryTime ? new Date(metrics.nextRetryTime).toISOString() : 'unknown';
    
    // Return MCP-compatible error response
    return {
      content: [{
        type: "text",
        text: `⚠️ Service temporarily unavailable - Circuit breaker is OPEN for '${toolName}'\n\n` +
              `🔴 Current State: ${metrics.state}\n` +
              `📊 Failure Rate: ${(metrics.failureRate * 100).toFixed(1)}%\n` +
              `🔁 Consecutive Failures: ${metrics.consecutiveFailures}\n` +
              `⏰ Next Retry: ${nextRetryTime}\n` +
              `⚡ Backoff Delay: ${(metrics.backoffDelay / 1000).toFixed(1)}s\n\n` +
              `The system is protecting against cascading failures. Please try again in a moment.`
      }],
      isError: true,
      circuitBreakerOpen: true
    };
  }
  
  /**
   * Get circuit breaker metrics for monitoring
   */
  getMetrics(): CircuitBreakerMetrics {
    return this.circuitBreaker.getMetrics();
  }
  
  /**
   * Get detailed health report
   */
  getHealthReport(): {
    enabled: boolean;
    metrics: CircuitBreakerMetrics;
    failureAnalysis: any;
    recommendations: string[];
  } {
    const metrics = this.getMetrics();
    const failureAnalysis = this.circuitBreaker.getFailureAnalysis();
    const recommendations = this.generateRecommendations(metrics, failureAnalysis);
    
    return {
      enabled: this.isEnabled,
      metrics,
      failureAnalysis,
      recommendations
    };
  }
  
  /**
   * Generate recommendations based on current state
   */
  private generateRecommendations(metrics: CircuitBreakerMetrics, failureAnalysis: any): string[] {
    const recommendations: string[] = [];
    
    // State-based recommendations
    if (metrics.state === 'OPEN') {
      recommendations.push('Circuit breaker is OPEN - investigate underlying service issues');
      recommendations.push(`Next retry in ${Math.ceil((metrics.nextRetryTime! - Date.now()) / 1000)}s`);
    } else if (metrics.state === 'HALF_OPEN') {
      recommendations.push('Circuit breaker is testing recovery - monitor success rate closely');
    }
    
    // Failure rate recommendations
    if (metrics.failureRate > 0.3) {
      recommendations.push(`High failure rate (${(metrics.failureRate * 100).toFixed(1)}%) - investigate error patterns`);
    }
    
    // Tool-specific recommendations
    Object.entries(metrics.toolStats).forEach(([toolName, stats]) => {
      if (stats.failureCount > stats.successCount) {
        recommendations.push(`Tool '${toolName}' has more failures than successes - investigate specific issues`);
      }
      
      if (stats.consecutiveFailures > 3) {
        recommendations.push(`Tool '${toolName}' has ${stats.consecutiveFailures} consecutive failures - may need manual intervention`);
      }
      
      if (stats.averageResponseTime > 10000) {
        recommendations.push(`Tool '${toolName}' has slow response time (${(stats.averageResponseTime / 1000).toFixed(1)}s) - check for performance issues`);
      }
    });
    
    // Error pattern recommendations
    const { errorTypeDistribution } = failureAnalysis;
    if (errorTypeDistribution.browser_crash > 0) {
      recommendations.push('Browser crashes detected - consider browser stability improvements');
    }
    if (errorTypeDistribution.memory_pressure > 0) {
      recommendations.push('Memory pressure detected - monitor system resources');
    }
    if (errorTypeDistribution.network_timeout > 0) {
      recommendations.push('Network timeouts detected - check network connectivity and timeouts');
    }
    
    // General recommendations
    if (recommendations.length === 0) {
      if (metrics.state === 'CLOSED' && metrics.failureRate < 0.1) {
        recommendations.push('System is healthy - circuit breaker providing effective protection');
      } else {
        recommendations.push('Monitor system closely for any developing issues');
      }
    }
    
    return recommendations;
  }
  
  /**
   * Reset circuit breaker (for manual recovery)
   */
  reset(): void {
    this.circuitBreaker.reset();
    console.error('[CircuitBreakerIntegration] Circuit breaker manually reset');
  }
  
  /**
   * Test circuit breaker by simulating failure
   */
  async testCircuitBreaker(toolName: string = 'test-tool'): Promise<{
    beforeState: string;
    afterState: string;
    tripSuccessful: boolean;
  }> {
    const beforeState = this.circuitBreaker.getMetrics().state;
    
    // Simulate multiple failures to trip circuit breaker
    const maxFailures = 6; // Should exceed maxConsecutiveFailures
    let tripSuccessful = false;
    
    for (let i = 0; i < maxFailures; i++) {
      try {
        await this.circuitBreaker.execute(toolName, async () => {
          throw new Error(`Simulated failure ${i + 1} for circuit breaker test`);
        });
      } catch (error) {
        if (error instanceof CircuitBreakerOpenError) {
          tripSuccessful = true;
          break;
        }
      }
    }
    
    const afterState = this.circuitBreaker.getMetrics().state;
    
    return {
      beforeState,
      afterState,
      tripSuccessful
    };
  }
}

/**
 * Utility function to wrap MCP tool handlers with circuit breaker protection
 */
export function withCircuitBreaker<TParams, TResult>(
  toolName: string
) {
  return (handler: (params: TParams) => Promise<TResult>) => {
    return async (params: TParams): Promise<TResult> => {
      const integration = CircuitBreakerIntegration.getInstance();
      return await integration.wrapMCPTool(toolName, params, handler);
    };
  };
}

/**
 * Enhanced tool wrapper that provides both protocol validation and circuit breaker protection
 */
export async function executeProtectedTool<T extends Record<string, any>>(
  toolName: string,
  params: T,
  implementation: (validatedParams: T) => Promise<any>,
  protocolValidation?: any // ProtocolValidationLayer instance
): Promise<any> {
  const integration = CircuitBreakerIntegration.getInstance();
  
  return await integration.wrapMCPTool(toolName, params, async (validatedParams: T) => {
    // Apply protocol validation if available
    if (protocolValidation) {
      try {
        const validated = await protocolValidation.processToolCall(toolName, validatedParams);
        const result = await implementation(validated.params);
        const validatedResponse = await protocolValidation.processResponse(result);
        return validatedResponse;
      } catch (error) {
        if (protocolValidation && error instanceof Error) {
          const errorResponse = await protocolValidation.processErrorResponse(error);
          return errorResponse;
        }
        throw error;
      }
    } else {
      // Execute without protocol validation
      return await implementation(validatedParams);
    }
  });
}

/**
 * Enhanced tool wrapper with Claude-aware error handling (Phase 3D)
 * Provides comprehensive error handling with user-friendly messages and recovery suggestions
 */
export async function executeProtectedToolWithClaude<T extends Record<string, any>>(
  toolName: string,
  params: T,
  implementation: (validatedParams: T) => Promise<any>,
  protocolValidation?: any, // ProtocolValidationLayer instance
  operationDescription?: string
): Promise<any> {
  const startTime = Date.now();
  const integration = CircuitBreakerIntegration.getInstance();
  
  try {
    return await integration.wrapMCPTool(toolName, params, async (validatedParams: T) => {
      // Apply protocol validation if available
      if (protocolValidation) {
        try {
          const validated = await protocolValidation.processToolCall(toolName, validatedParams);
          const result = await implementation(validated.params);
          const validatedResponse = await protocolValidation.processResponse(result);
          return validatedResponse;
        } catch (error) {
          if (protocolValidation && error instanceof Error) {
            const errorResponse = await protocolValidation.processErrorResponse(error);
            return errorResponse;
          }
          throw error;
        }
      } else {
        // Execute without protocol validation
        return await implementation(validatedParams);
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Handle circuit breaker open errors with enhanced messaging
    if (error instanceof CircuitBreakerOpenError) {
      const metrics = integration.getMetrics();
      
      // Create tool context for Claude-aware error handling
      const toolContext: ToolContext = {
        toolName,
        operation: operationDescription || `Execute ${toolName}`,
        parameters: params,
        url: params.url as string,
        selector: params.selector as string,
        profile: params.profile as string,
        sessionName: params.sessionName as string,
        timestamp: startTime,
        totalDuration: duration
      };
      
      // Use Claude-aware error handling for circuit breaker errors
      const claudeErrorResponse = await handleToolError(error, toolContext.toolName, toolContext.operation, {
        parameters: toolContext.parameters,
        url: toolContext.url,
        selector: toolContext.selector,
        profile: toolContext.profile,
        sessionName: toolContext.sessionName,
        totalDuration: duration
      });
      
      // Return enhanced MCP response with Claude-friendly error
      return {
        content: [{
          type: "text",
          text: buildClaudeErrorResponse(claudeErrorResponse, metrics)
        }],
        isError: true,
        _meta: {
          toolName,
          operation: toolContext.operation,
          duration,
          fallbackAvailable: claudeErrorResponse.fallbackAvailable,
          canRetry: claudeErrorResponse.canRetry,
          degradationLevel: claudeErrorResponse.degradationLevel,
          estimatedRecovery: claudeErrorResponse.estimatedRecovery
        }
      };
    }
    
    // Handle other errors with Claude-aware error handling
    const toolContext: ToolContext = {
      toolName,
      operation: operationDescription || `Execute ${toolName}`,
      parameters: params,
      url: params.url as string,
      selector: params.selector as string,
      profile: params.profile as string,
      sessionName: params.sessionName as string,
      timestamp: startTime,
      totalDuration: duration
    };
    
    const claudeErrorResponse = await handleToolError(error, toolContext.toolName, toolContext.operation, {
      parameters: toolContext.parameters,
      url: toolContext.url,
      selector: toolContext.selector,
      profile: toolContext.profile,
      sessionName: toolContext.sessionName,
      totalDuration: duration
    });
    
    // Return enhanced MCP response with Claude-friendly error
    return {
      content: [{
        type: "text",
        text: buildClaudeErrorResponse(claudeErrorResponse)
      }],
      isError: true,
      _meta: {
        toolName,
        operation: toolContext.operation,
        duration,
        fallbackAvailable: claudeErrorResponse.fallbackAvailable,
        canRetry: claudeErrorResponse.canRetry,
        degradationLevel: claudeErrorResponse.degradationLevel,
        estimatedRecovery: claudeErrorResponse.estimatedRecovery
      }
    };
  }
}

/**
 * Build Claude-friendly error response text
 */
function buildClaudeErrorResponse(claudeResponse: any, circuitBreakerMetrics?: CircuitBreakerMetrics): string {
  let text = `❌ ${claudeResponse.error}`;
  
  // Add circuit breaker specific information if available
  if (circuitBreakerMetrics) {
    text += `\n\n🔴 **Circuit Breaker Status:**`;
    text += `\n• State: ${circuitBreakerMetrics.state}`;
    text += `\n• Failure Rate: ${(circuitBreakerMetrics.failureRate * 100).toFixed(1)}%`;
    text += `\n• Consecutive Failures: ${circuitBreakerMetrics.consecutiveFailures}`;
    
    if (circuitBreakerMetrics.nextRetryTime) {
      const nextRetry = new Date(circuitBreakerMetrics.nextRetryTime);
      text += `\n• Next Retry: ${nextRetry.toLocaleString()}`;
    }
  }
  
  // Add suggestions if available
  if (claudeResponse.suggestions && claudeResponse.suggestions.length > 0) {
    text += '\n\n💡 **Suggestions:**';
    claudeResponse.suggestions.forEach((suggestion: string, index: number) => {
      text += `\n${index + 1}. ${suggestion}`;
    });
  }
  
  // Add fallback information
  if (claudeResponse.fallbackAvailable) {
    text += '\n\n🔄 **Alternative:** Simplified tools are available for basic operations.';
  }
  
  // Add retry information
  if (claudeResponse.canRetry) {
    text += '\n\n🔄 **Retry:** This operation can be retried.';
    if (claudeResponse.estimatedRecovery) {
      text += ` Try again in ${claudeResponse.estimatedRecovery}.`;
    }
  }
  
  // Add system status information
  if (claudeResponse.degradationLevel) {
    text += `\n\n⚠️ **System Status:** ${claudeResponse.degradationLevel}`;
  }
  
  return text;
}