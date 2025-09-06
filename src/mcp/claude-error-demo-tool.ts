/**
 * Claude Error Handling Demo Tool
 * 
 * A demonstration tool that showcases the Claude-aware error handling system
 * by allowing users to trigger various error types and see how they are handled.
 */

import { z } from "zod";

/**
 * Demo tool that triggers different error types to showcase Claude-aware error handling
 */
export function createClaudeErrorDemoTool(server: any, executeValidatedTool: Function) {
  server.tool(
    "claude_error_demo",
    "Demonstrate Claude-aware error handling by triggering various error types",
    {
      errorType: z.enum([
        'browser_crash',
        'network_timeout', 
        'element_not_found',
        'memory_pressure',
        'connection_failure',
        'validation_error',
        'session_expired',
        'permission_denied',
        'navigation_error',
        'unknown_error',
        'circuit_breaker_open'
      ]).describe("Type of error to demonstrate"),
      context: z.object({
        toolName: z.string().optional().describe("Tool name to simulate error for"),
        url: z.string().optional().describe("URL context for the error"),
        selector: z.string().optional().describe("Selector context for the error"),
        sessionName: z.string().optional().describe("Session name for session-related errors")
      }).optional().describe("Context information for the error")
    },
    async ({ errorType, context = {} }) => {
      return await executeValidatedTool("claude_error_demo", { errorType, context }, async ({ errorType, context }) => {
        // Simulate the requested error type
        const errorMessage = getErrorMessage(errorType, context);
        const simulatedError = new Error(errorMessage);
        
        // Add some realistic delay to simulate actual operation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        
        // Throw the simulated error (this will be caught and handled by Claude-aware error handling)
        throw simulatedError;
      }, `Demonstrate ${errorType} error handling`);
    }
  );

  server.tool(
    "claude_error_metrics",
    "Get comprehensive error handling metrics and system health status",
    {},
    async () => {
      return await executeValidatedTool("claude_error_metrics", {}, async () => {
        // Import the error handler dynamically to get metrics
        const { ClaudeErrorHandler } = await import('../core/claude-error-handler.js');
        const { getErrorHandlingMetrics } = await import('../core/mcp-error-integration.js');
        
        const handler = ClaudeErrorHandler.getInstance();
        const handlerMetrics = handler.getMetrics();
        const integrationMetrics = getErrorHandlingMetrics();
        
        const report = {
          errorHandling: {
            totalErrorsHandled: handlerMetrics.handledErrors,
            averageHandlingTime: `${handlerMetrics.averageHandlingTime.toFixed(2)}ms`,
            errorTypeDistribution: handlerMetrics.errorTypeDistribution
          },
          systemHealth: {
            circuitBreakerState: handlerMetrics.systemHealth.circuitBreakerState,
            degradationLevel: handlerMetrics.systemHealth.degradationLevel,
            connectionPoolHealth: handlerMetrics.systemHealth.connectionPoolHealth,
            failureRate: `${(handlerMetrics.systemHealth.failureRate * 100).toFixed(1)}%`,
            availableTools: `${handlerMetrics.systemHealth.availableTools}/${handlerMetrics.systemHealth.totalTools}`,
            systemLoad: handlerMetrics.systemHealth.systemLoad
          },
          integration: integrationMetrics
        };
        
        return {
          content: [{
            type: "text",
            text: `📊 **Claude-Aware Error Handling Metrics**\n\n` +
                  `**Error Handling Performance:**\n` +
                  `• Total Errors Handled: ${report.errorHandling.totalErrorsHandled}\n` +
                  `• Average Handling Time: ${report.errorHandling.averageHandlingTime}\n` +
                  `• Error Type Distribution: ${JSON.stringify(report.errorHandling.errorTypeDistribution, null, 2)}\n\n` +
                  
                  `**System Health Status:**\n` +
                  `• Circuit Breaker State: ${report.systemHealth.circuitBreakerState}\n` +
                  `• Degradation Level: ${report.systemHealth.degradationLevel}\n` +
                  `• Connection Pool Health: ${report.systemHealth.connectionPoolHealth}\n` +
                  `• Failure Rate: ${report.systemHealth.failureRate}\n` +
                  `• Available Tools: ${report.systemHealth.availableTools}\n` +
                  `• System Load: ${report.systemHealth.systemLoad}\n\n` +
                  
                  `**Integration Metrics:**\n` +
                  `${JSON.stringify(report.integration, null, 2)}`
          }]
        };
      }, 'Get error handling metrics and system health status');
    }
  );

  server.tool(
    "claude_error_test_recovery",
    "Test error recovery suggestions and fallback mechanisms",
    {
      scenario: z.enum([
        'browser_restart_needed',
        'network_connection_issue', 
        'element_interaction_failure',
        'session_authentication_required',
        'system_resource_exhaustion'
      ]).describe("Recovery scenario to test")
    },
    async ({ scenario }) => {
      return await executeValidatedTool("claude_error_test_recovery", { scenario }, async ({ scenario }) => {
        // Create a complex error scenario that tests recovery suggestions
        const { errorType, context, shouldSucceedAfterRecovery } = getRecoveryScenario(scenario);
        
        // Simulate the error
        const errorMessage = getErrorMessage(errorType, context);
        const simulatedError = new Error(errorMessage);
        
        // Add metadata to help with recovery testing
        simulatedError.scenario = scenario;
        simulatedError.recoveryTestData = {
          canRecover: shouldSucceedAfterRecovery,
          estimatedRecoveryTime: getEstimatedRecoveryTime(errorType),
          fallbacksAvailable: getFallbacksForScenario(scenario)
        };
        
        throw simulatedError;
      }, `Test recovery for ${scenario} scenario`);
    }
  );
}

/**
 * Generate realistic error messages for different error types
 */
function getErrorMessage(errorType: string, context: any): string {
  const messages = {
    browser_crash: "Browser process crashed unexpectedly. The Playwright browser instance was terminated due to insufficient memory or system resources.",
    network_timeout: `Request timeout after 30000ms when trying to ${context.url ? `navigate to ${context.url}` : 'perform network operation'}. The server may be unresponsive or your connection may be slow.`,
    element_not_found: `Element not found: ${context.selector || 'button[data-test="submit"]'}. The element may not exist on the page or may not be visible yet.`,
    memory_pressure: "Out of memory: Cannot allocate additional heap space. The system is under memory pressure and needs to free up resources.",
    connection_failure: `Connection refused: ECONNREFUSED ${context.url || 'localhost:3000'}. The target server is not accepting connections.`,
    validation_error: "Validation failed: Invalid parameter format. The provided parameters do not match the expected schema.",
    session_expired: `Session expired for ${context.sessionName || 'user session'}. Authentication is required to continue.`,
    permission_denied: "Access denied: Insufficient permissions to perform this operation. You may need to authenticate with higher privileges.",
    navigation_error: `Navigation failed: DNS resolution failed for ${context.url || 'example.com'}. The domain name could not be resolved.`,
    unknown_error: "An unexpected error occurred during operation execution. The system encountered an unrecognized error condition.",
    circuit_breaker_open: `Circuit breaker is OPEN for tool '${context.toolName || 'browser_click'}'. Too many consecutive failures have been detected.`
  };
  
  return messages[errorType] || messages.unknown_error;
}

/**
 * Get recovery scenario configuration
 */
function getRecoveryScenario(scenario: string) {
  const scenarios = {
    browser_restart_needed: {
      errorType: 'browser_crash',
      context: { toolName: 'mcp__playwright__mcp_browser_click' },
      shouldSucceedAfterRecovery: true
    },
    network_connection_issue: {
      errorType: 'network_timeout',
      context: { url: 'https://slow-server.com' },
      shouldSucceedAfterRecovery: false
    },
    element_interaction_failure: {
      errorType: 'element_not_found',
      context: { selector: 'button[data-test="dynamic-submit"]', url: 'https://example.com/form' },
      shouldSucceedAfterRecovery: true
    },
    session_authentication_required: {
      errorType: 'session_expired',
      context: { sessionName: 'user-auth-token' },
      shouldSucceedAfterRecovery: true
    },
    system_resource_exhaustion: {
      errorType: 'memory_pressure',
      context: {},
      shouldSucceedAfterRecovery: false
    }
  };
  
  return scenarios[scenario] || scenarios.browser_restart_needed;
}

/**
 * Get estimated recovery time for error type
 */
function getEstimatedRecoveryTime(errorType: string): number {
  const recoveryTimes = {
    browser_crash: 15000,
    network_timeout: 30000,
    element_not_found: 5000,
    memory_pressure: 60000,
    connection_failure: 12000,
    validation_error: 0,
    session_expired: 10000,
    permission_denied: 0,
    navigation_error: 15000,
    unknown_error: 10000,
    circuit_breaker_open: 30000
  };
  
  return recoveryTimes[errorType] || 10000;
}

/**
 * Get available fallbacks for scenario
 */
function getFallbacksForScenario(scenario: string): string[] {
  const fallbacks = {
    browser_restart_needed: ['browser_click', 'browser_type', 'browser_navigate'],
    network_connection_issue: ['cached_operations', 'offline_mode'],
    element_interaction_failure: ['simplified_selectors', 'text_based_selection'],
    session_authentication_required: ['manual_authentication', 'session_recreation'],
    system_resource_exhaustion: ['simplified_operations', 'resource_cleanup']
  };
  
  return fallbacks[scenario] || [];
}