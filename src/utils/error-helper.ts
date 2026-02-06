/**
 * Error helper for user-friendly error messages and suggestions
 */

export interface ErrorContext {
  operation: string;
  selector?: string;
  url?: string;
  text?: string;
  profile?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface UserFriendlyError {
  message: string;
  details: string;
  suggestions: string[];
  isRetriable: boolean;
  errorCode: string;
}

export class ErrorHelper {
  /**
   * Convert technical errors to user-friendly messages with actionable suggestions
   */
  static createUserFriendlyError(error: Error, context: ErrorContext): UserFriendlyError {
    const errorMessage = error.message.toLowerCase();

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
      return {
        message: `Operation timed out while ${context.operation}`,
        details: context.selector
          ? `Could not find element: ${context.selector}`
          : 'The operation took too long to complete',
        suggestions: [
          'Wait for the page to fully load',
          'Check if the element exists with a different selector',
          'Try increasing the timeout',
          context.selector ? `Alternative: Use browser_wait_for to wait for "${context.selector}" first` : ''
        ].filter(Boolean),
        isRetriable: true,
        errorCode: 'TIMEOUT'
      };
    }

    // Element not found
    if (errorMessage.includes('no element found') || errorMessage.includes('not found')) {
      return {
        message: `Element not found`,
        details: `Selector "${context.selector}" did not match any elements`,
        suggestions: [
          'Verify the selector in browser DevTools',
          'Try a more generic selector (e.g., use text content)',
          'Check if the element is in an iframe',
          'Use browser_snapshot to see available elements',
          `Example: Try "text=${context.selector?.replace(/[^\w\s]/g, '')}" for text-based selection`
        ],
        isRetriable: true,
        errorCode: 'ELEMENT_NOT_FOUND'
      };
    }

    // Element not visible
    if (errorMessage.includes('not visible') || errorMessage.includes('hidden')) {
      return {
        message: `Element exists but is not visible`,
        details: `The element matching "${context.selector}" is hidden or covered`,
        suggestions: [
          'Wait for the element to become visible',
          'Check if a modal or overlay is covering it',
          'Scroll the element into view first',
          'Use browser_evaluate to check element visibility',
          `Try: browser_wait_for with selector "${context.selector}" and state "visible"`
        ],
        isRetriable: true,
        errorCode: 'ELEMENT_NOT_VISIBLE'
      };
    }

    // Invalid selector
    if (errorMessage.includes('invalid selector') || errorMessage.includes('syntax')) {
      return {
        message: `Invalid selector syntax`,
        details: `The selector "${context.selector}" has incorrect syntax`,
        suggestions: [
          'Check for unmatched quotes or brackets',
          'Use simple CSS selectors: #id, .class, tag',
          'For text selection use: text="exact text"',
          'Escape special characters with backslash',
          `Valid examples: button, #submit, .btn-primary, text="Click me"`
        ],
        isRetriable: false,
        errorCode: 'INVALID_SELECTOR'
      };
    }

    // Navigation errors
    if (errorMessage.includes('navigation') || errorMessage.includes('net::err')) {
      return {
        message: `Navigation failed`,
        details: `Could not navigate to ${context.url || 'the requested page'}`,
        suggestions: [
          'Check if the URL is correct and accessible',
          'Verify internet connection',
          'Check if the site requires authentication',
          'Try with a different browser profile',
          context.url ? `Test URL in browser: ${context.url}` : ''
        ].filter(Boolean),
        isRetriable: true,
        errorCode: 'NAVIGATION_FAILED'
      };
    }

    // Browser/context errors
    if (errorMessage.includes('target closed') || errorMessage.includes('context')) {
      return {
        message: `Browser connection lost`,
        details: 'The browser page or context was closed unexpectedly',
        suggestions: [
          'Restart the browser with browser_close and retry',
          'Check if a popup or dialog closed the page',
          'Verify browser hasn\'t crashed',
          'Try refreshing the page first'
        ],
        isRetriable: true,
        errorCode: 'BROWSER_CLOSED'
      };
    }

    // Default fallback
    return {
      message: context.operation ? `Failed to ${context.operation}` : 'Operation failed',
      details: error.message,
      suggestions: [
        'Check the browser console for errors (browser_console_messages)',
        'Take a screenshot to see current state (browser_screenshot)',
        'View the page structure (browser_snapshot)',
        'Try a simpler operation first to verify the page is loaded'
      ],
      isRetriable: false,
      errorCode: 'UNKNOWN'
    };
  }

  /**
   * Format error for MCP response
   */
  static formatMCPError(error: Error, context: ErrorContext): any {
    const userError = this.createUserFriendlyError(error, context);
    const attemptInfo = context.attempt && context.maxAttempts
      ? ` (attempt ${context.attempt}/${context.maxAttempts})`
      : '';

    return {
      content: [{
        type: "text",
        text: `❌ ${userError.message}${attemptInfo}\n\n` +
              `Details: ${userError.details}\n\n` +
              `💡 Suggestions:\n${userError.suggestions.map(s => `• ${s}`).join('\n')}`
      }],
      isError: true,
      metadata: {
        errorCode: userError.errorCode,
        isRetriable: userError.isRetriable,
        operation: context.operation,
        selector: context.selector,
        url: context.url,
        suggestions: userError.suggestions
      }
    };
  }

  /**
   * Log error with context for debugging
   */
  static logError(error: Error, context: ErrorContext): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error in ${context.operation}:`);
    console.error(`  Message: ${error.message}`);
    if (context.selector) console.error(`  Selector: ${context.selector}`);
    if (context.url) console.error(`  URL: ${context.url}`);
    if (context.profile) console.error(`  Profile: ${context.profile}`);
    if (error.stack) {
      console.error(`  Stack trace:\n${error.stack.split('\n').slice(1, 4).join('\n')}`);
    }
  }
}