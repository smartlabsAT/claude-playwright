/**
 * MCP Tool Error Integration - Claude-Aware Error Handling
 * 
 * Provides enhanced error handling wrapper for MCP tools with Claude-friendly
 * error responses, recovery suggestions, and fallback tool information.
 * 
 * Key Features:
 * - Automatic error translation to user-friendly messages
 * - Context-aware recovery suggestions
 * - Fallback tool availability indication
 * - Circuit breaker and degradation level integration
 * - Performance monitoring and error tracking
 */

import { handleToolError, ClaudeErrorHandler, ErrorResponse } from './claude-error-handler.js';

// ============= MCP RESPONSE TYPES =============

/**
 * Enhanced MCP tool response with Claude-aware error handling
 */
export interface EnhancedMCPResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
  _meta?: {
    toolName: string;
    operation: string;
    duration?: number;
    fallbackAvailable?: boolean;
    canRetry?: boolean;
    suggestions?: string[];
    degradationLevel?: string;
    estimatedRecovery?: string;
  };
}

/**
 * MCP tool operation context for error handling
 */
export interface MCPOperationContext {
  toolName: string;
  operation: string;
  parameters?: Record<string, any>;
  url?: string;
  selector?: string;
  profile?: string;
  sessionName?: string;
}

// ============= MCP ERROR WRAPPER FUNCTIONS =============

/**
 * Wrapper function for MCP tools that provides Claude-aware error handling
 */
export async function withClaudeErrorHandling<TInput, TOutput>(
  context: MCPOperationContext,
  operation: (input: TInput) => Promise<TOutput>,
  input: TInput
): Promise<EnhancedMCPResponse> {
  const startTime = Date.now();
  
  try {
    // Execute the operation
    const result = await operation(input);
    const duration = Date.now() - startTime;
    
    // Return successful response
    return {
      content: [{
        type: "text" as const,
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }],
      _meta: {
        toolName: context.toolName,
        operation: context.operation,
        duration
      }
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Handle error with Claude-aware error handler
    const errorResponse = await handleToolError(error, context.toolName, context.operation, {
      parameters: context.parameters,
      url: context.url,
      selector: context.selector,
      profile: context.profile,
      sessionName: context.sessionName,
      totalDuration: duration
    });
    
    // Build enhanced error response
    const errorText = buildErrorResponseText(errorResponse);
    
    return {
      content: [{
        type: "text" as const,
        text: errorText
      }],
      isError: true,
      _meta: {
        toolName: context.toolName,
        operation: context.operation,
        duration,
        fallbackAvailable: errorResponse.fallbackAvailable,
        canRetry: errorResponse.canRetry,
        suggestions: errorResponse.suggestions,
        degradationLevel: errorResponse.degradationLevel,
        estimatedRecovery: errorResponse.estimatedRecovery
      }
    };
  }
}

/**
 * Simplified wrapper for operations that return text responses
 */
export async function withClaudeErrorHandlingSimple(
  context: MCPOperationContext,
  operation: () => Promise<string>
): Promise<EnhancedMCPResponse> {
  return withClaudeErrorHandling(context, () => operation(), {});
}

/**
 * Wrapper specifically for browser operations with page context
 */
export async function withBrowserErrorHandling(
  context: MCPOperationContext & { page?: any },
  operation: () => Promise<any>
): Promise<EnhancedMCPResponse> {
  // Extract current URL from page if available
  let currentUrl: string | undefined;
  try {
    if (context.page) {
      currentUrl = context.page.url();
    }
  } catch {
    // Ignore errors getting URL
  }
  
  const enhancedContext: MCPOperationContext = {
    ...context,
    url: context.url || currentUrl
  };
  
  return withClaudeErrorHandlingSimple(enhancedContext, operation);
}

/**
 * Build user-friendly error response text from ErrorResponse
 */
function buildErrorResponseText(errorResponse: ErrorResponse): string {
  let text = `❌ ${errorResponse.error}`;
  
  // Add suggestions if available
  if (errorResponse.suggestions && errorResponse.suggestions.length > 0) {
    text += '\n\n💡 **Suggestions:**';
    errorResponse.suggestions.forEach((suggestion, index) => {
      text += `\n${index + 1}. ${suggestion}`;
    });
  }
  
  // Add fallback information
  if (errorResponse.fallbackAvailable) {
    text += '\n\n🔄 **Alternative:** Simplified tools are available for basic operations.';
  }
  
  // Add retry information
  if (errorResponse.canRetry) {
    text += '\n\n🔄 **Retry:** This operation can be retried.';
    if (errorResponse.estimatedRecovery) {
      text += ` Try again in ${errorResponse.estimatedRecovery}.`;
    }
  }
  
  // Add system status information
  if (errorResponse.degradationLevel) {
    text += `\n\n⚠️ **System Status:** ${errorResponse.degradationLevel}`;
  }
  
  return text;
}

/**
 * Helper function to create MCP operation context from tool parameters
 */
export function createMCPContext(
  toolName: string,
  operation: string,
  parameters?: Record<string, any>
): MCPOperationContext {
  return {
    toolName,
    operation,
    parameters,
    // Extract common parameters
    url: parameters?.url,
    selector: parameters?.selector,
    profile: parameters?.profile,
    sessionName: parameters?.sessionName
  };
}

/**
 * Success response helper for consistent MCP responses
 */
export function createSuccessResponse(
  result: any,
  meta?: Partial<EnhancedMCPResponse['_meta']>
): EnhancedMCPResponse {
  return {
    content: [{
      type: "text" as const,
      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    }],
    _meta: meta
  };
}

/**
 * Helper to wrap existing MCP tool functions with error handling
 */
export function wrapMCPTool<TParams>(
  toolName: string,
  operation: string,
  originalHandler: (params: TParams) => Promise<any>
): (params: TParams) => Promise<EnhancedMCPResponse> {
  return async (params: TParams) => {
    const context = createMCPContext(toolName, operation, params as any);
    return withClaudeErrorHandling(context, originalHandler, params);
  };
}

// ============= COMMON ERROR PATTERNS FOR MCP TOOLS =============

/**
 * Common error handling patterns for specific MCP tool types
 */
export const MCPErrorPatterns = {
  /**
   * Browser navigation errors
   */
  navigation: (url: string) => ({
    toolName: 'browser_navigate',
    operation: `Navigate to ${url}`,
    url,
    parameters: { url }
  }),
  
  /**
   * Element interaction errors
   */
  elementInteraction: (selector: string, action: string, url?: string) => ({
    toolName: `browser_${action}`,
    operation: `${action} element ${selector}`,
    selector,
    url,
    parameters: { selector }
  }),
  
  /**
   * Session management errors
   */
  session: (sessionName: string, action: string) => ({
    toolName: `browser_session_${action}`,
    operation: `${action} session ${sessionName}`,
    sessionName,
    parameters: { sessionName }
  }),
  
  /**
   * Test execution errors
   */
  testExecution: (testName: string, action: string) => ({
    toolName: `browser_${action}_test`,
    operation: `${action} test ${testName}`,
    parameters: { testName }
  })
};

/**
 * Get error handler metrics for monitoring
 */
export function getErrorHandlingMetrics(): {
  handledErrors: number;
  averageHandlingTime: number;
  errorTypeDistribution: Record<string, number>;
  systemHealth: any;
} {
  return ClaudeErrorHandler.getInstance().getMetrics();
}