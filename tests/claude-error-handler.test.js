#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Claude-Aware Error Handling (Phase 3D)
 * 
 * Tests all aspects of the Claude error handling system including:
 * - Error classification and pattern matching
 * - Claude-friendly message translation
 * - Recovery suggestion generation
 * - Circuit breaker integration
 * - Connection pool health integration
 * - Degradation level awareness
 * - MCP tool error handling wrapper
 */

import { ClaudeErrorHandler, handleToolError } from '../src/core/claude-error-handler.js';
import { ErrorClassifier, ErrorType } from '../src/core/circuit-breaker.js';
import { executeProtectedToolWithClaude } from '../src/core/circuit-breaker-integration.js';
import { withClaudeErrorHandling, createMCPContext, getErrorHandlingMetrics } from '../src/core/mcp-error-integration.js';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const TEST_CONFIG = {
  verbose: true,
  performance: true,
  iterations: 100
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  startTime: Date.now(),
  details: []
};

// Utility functions
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    if (TEST_CONFIG.verbose) {
      console.error(`✅ PASS: ${message}`);
    }
  } else {
    testResults.failed++;
    console.error(`❌ FAIL: ${message}`);
    testResults.details.push({ test: message, status: 'FAILED' });
  }
}

function assertContains(str, substring, message) {
  const condition = typeof str === 'string' && str.includes(substring);
  assert(condition, `${message} (looking for "${substring}" in "${str?.substring(0, 100)}...")`);
}

function assertNotEmpty(value, message) {
  const condition = value !== null && value !== undefined && 
    (typeof value === 'string' ? value.trim().length > 0 : 
     Array.isArray(value) ? value.length > 0 : true);
  assert(condition, message);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock data for testing
const mockErrors = {
  browserCrash: new Error('Browser process crashed unexpectedly'),
  networkTimeout: new Error('Request timeout after 30000ms'),
  elementNotFound: new Error('Element not found: button[data-test="submit"]'),
  memoryPressure: new Error('Out of memory: Cannot allocate 128MB'),
  connectionFailure: new Error('Connection refused: ECONNREFUSED'),
  validationError: new Error('Validation failed: Invalid parameter format'),
  sessionExpired: new Error('Session expired: Authentication required'),
  permissionDenied: new Error('Access denied: Insufficient permissions'),
  navigationError: new Error('Navigation failed: DNS resolution failed'),
  unknownError: new Error('Something went wrong')
};

const mockToolContexts = {
  browserClick: {
    toolName: 'mcp__playwright__mcp_browser_click',
    operation: 'Click submit button',
    url: 'https://example.com/form',
    selector: 'button[data-test="submit"]',
    parameters: { selector: 'button[data-test="submit"]' }
  },
  sessionRestore: {
    toolName: 'mcp__playwright__mcp_session_restore',
    operation: 'Restore user session',
    sessionName: 'test-user',
    parameters: { sessionName: 'test-user' }
  },
  browserNavigate: {
    toolName: 'mcp__playwright__mcp_browser_navigate',
    operation: 'Navigate to page',
    url: 'https://example.com',
    parameters: { url: 'https://example.com' }
  }
};

// Test Suite Functions
async function testErrorClassification() {
  console.error('\n🧪 Testing Error Classification System...');
  
  // Test browser crash classification
  const browserCrashResult = ErrorClassifier.classifyError(mockErrors.browserCrash);
  assert(browserCrashResult.type === ErrorType.BROWSER_CRASH, 'Browser crash properly classified');
  assert(browserCrashResult.retriable === true, 'Browser crash marked as retriable');
  assert(browserCrashResult.shouldTrip === true, 'Browser crash should trip circuit breaker');
  
  // Test network timeout classification
  const networkTimeoutResult = ErrorClassifier.classifyError(mockErrors.networkTimeout);
  assert(networkTimeoutResult.type === ErrorType.NETWORK_TIMEOUT, 'Network timeout properly classified');
  assert(networkTimeoutResult.retriable === true, 'Network timeout marked as retriable');
  
  // Test element not found classification
  const elementNotFoundResult = ErrorClassifier.classifyError(mockErrors.elementNotFound);
  assert(elementNotFoundResult.type === ErrorType.ELEMENT_NOT_FOUND, 'Element not found properly classified');
  assert(elementNotFoundResult.retriable === true, 'Element not found marked as retriable');
  assert(elementNotFoundResult.shouldTrip === false, 'Element not found should not trip circuit breaker');
  
  // Test validation error classification
  const validationErrorResult = ErrorClassifier.classifyError(mockErrors.validationError);
  assert(validationErrorResult.type === ErrorType.VALIDATION_ERROR, 'Validation error properly classified');
  assert(validationErrorResult.retriable === false, 'Validation error marked as non-retriable');
  assert(validationErrorResult.shouldTrip === false, 'Validation error should not trip circuit breaker');
  
  // Test unknown error fallback
  const unknownErrorResult = ErrorClassifier.classifyError(mockErrors.unknownError);
  assert(unknownErrorResult.type === ErrorType.UNKNOWN, 'Unknown error properly classified');
  assert(unknownErrorResult.retriable === true, 'Unknown error marked as retriable by default');
}

async function testClaudeErrorTranslation() {
  console.error('\n🧪 Testing Claude Error Translation...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test browser crash translation
  const browserCrashResponse = await handler.handleError(mockErrors.browserCrash, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  assert(typeof browserCrashResponse.error === 'string', 'Browser crash error message is string');
  assertContains(browserCrashResponse.error.toLowerCase(), 'browser', 'Browser crash message mentions browser');
  assertContains(browserCrashResponse.error.toLowerCase(), 'crash', 'Browser crash message mentions crash');
  
  // Test network timeout translation
  const networkTimeoutResponse = await handler.handleError(mockErrors.networkTimeout, {
    ...mockToolContexts.browserNavigate,
    timestamp: Date.now()
  });
  
  assertContains(networkTimeoutResponse.error.toLowerCase(), 'network', 'Network timeout message mentions network');
  assertContains(networkTimeoutResponse.error.toLowerCase(), 'timeout', 'Network timeout message mentions timeout');
  
  // Test element not found translation
  const elementNotFoundResponse = await handler.handleError(mockErrors.elementNotFound, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  assertContains(elementNotFoundResponse.error.toLowerCase(), 'element', 'Element not found message mentions element');
  assertContains(elementNotFoundResponse.error.toLowerCase(), 'find', 'Element not found message mentions finding');
}

async function testRecoverySuggestions() {
  console.error('\n🧪 Testing Recovery Suggestions...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test browser crash suggestions
  const browserCrashResponse = await handler.handleError(mockErrors.browserCrash, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  assert(Array.isArray(browserCrashResponse.suggestions), 'Browser crash suggestions is array');
  assert(browserCrashResponse.suggestions.length > 0, 'Browser crash has recovery suggestions');
  assert(browserCrashResponse.canRetry === true, 'Browser crash is marked as retriable');
  
  // Test network timeout suggestions
  const networkTimeoutResponse = await handler.handleError(mockErrors.networkTimeout, {
    ...mockToolContexts.browserNavigate,
    timestamp: Date.now()
  });
  
  assert(networkTimeoutResponse.suggestions.length > 0, 'Network timeout has recovery suggestions');
  const hasNetworkSuggestion = networkTimeoutResponse.suggestions.some(s => 
    s.toLowerCase().includes('connection') || s.toLowerCase().includes('internet')
  );
  assert(hasNetworkSuggestion, 'Network timeout suggestions mention connection issues');
  
  // Test validation error suggestions
  const validationErrorResponse = await handler.handleError(mockErrors.validationError, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  assert(validationErrorResponse.canRetry === false, 'Validation error is not retriable');
  assert(validationErrorResponse.suggestions.length > 0, 'Validation error has suggestions');
  const hasValidationSuggestion = validationErrorResponse.suggestions.some(s => 
    s.toLowerCase().includes('parameter') || s.toLowerCase().includes('format')
  );
  assert(hasValidationSuggestion, 'Validation error suggestions mention parameters');
}

async function testFallbackToolDetection() {
  console.error('\n🧪 Testing Fallback Tool Detection...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test MCP tool with fallback available
  const mcpToolResponse = await handler.handleError(mockErrors.browserCrash, {
    toolName: 'mcp__playwright__mcp_browser_click',
    operation: 'Click button',
    timestamp: Date.now()
  });
  
  assert(mcpToolResponse.fallbackAvailable === true, 'MCP tool has fallback available');
  
  // Test basic tool without MCP fallback
  const basicToolResponse = await handler.handleError(mockErrors.browserCrash, {
    toolName: 'browser_click',
    operation: 'Click button',
    timestamp: Date.now()
  });
  
  assert(basicToolResponse.fallbackAvailable === false, 'Basic tool has no MCP fallback');
}

async function testRecoveryTimeEstimates() {
  console.error('\n🧪 Testing Recovery Time Estimates...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test browser crash recovery time
  const browserCrashResponse = await handler.handleError(mockErrors.browserCrash, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  assertNotEmpty(browserCrashResponse.estimatedRecovery, 'Browser crash has recovery time estimate');
  
  // Test validation error (should have no recovery time)
  const validationErrorResponse = await handler.handleError(mockErrors.validationError, {
    ...mockToolContexts.browserClick,
    timestamp: Date.now()
  });
  
  // Validation errors should either have no recovery time or "immediately"
  if (validationErrorResponse.estimatedRecovery) {
    assertContains(validationErrorResponse.estimatedRecovery.toLowerCase(), 'immediate', 
      'Validation error recovery time is immediate');
  }
}

async function testMCPIntegrationWrapper() {
  console.error('\n🧪 Testing MCP Integration Wrapper...');
  
  // Test successful operation
  const successContext = createMCPContext('test_tool', 'test operation', { param: 'value' });
  const successResponse = await withClaudeErrorHandling(successContext, async () => {
    return { result: 'success' };
  }, {});
  
  assert(successResponse.content && successResponse.content.length > 0, 'Successful operation returns content');
  assert(!successResponse.isError, 'Successful operation is not marked as error');
  assert(successResponse._meta && successResponse._meta.toolName === 'test_tool', 'Successful operation includes metadata');
  
  // Test failed operation
  const errorContext = createMCPContext('test_tool', 'failing operation', { param: 'value' });
  const errorResponse = await withClaudeErrorHandling(errorContext, async () => {
    throw mockErrors.browserCrash;
  }, {});
  
  assert(errorResponse.isError === true, 'Failed operation is marked as error');
  assert(errorResponse.content && errorResponse.content.length > 0, 'Failed operation returns error content');
  assert(errorResponse._meta && typeof errorResponse._meta.fallbackAvailable === 'boolean', 
    'Failed operation includes fallback availability');
  assert(errorResponse._meta && typeof errorResponse._meta.canRetry === 'boolean', 
    'Failed operation includes retry capability');
}

async function testPerformanceMetrics() {
  console.error('\n🧪 Testing Performance Metrics...');
  
  const handler = ClaudeErrorHandler.getInstance();
  const initialMetrics = handler.getMetrics();
  
  // Execute multiple error handling operations
  for (let i = 0; i < 10; i++) {
    await handler.handleError(mockErrors.browserCrash, {
      toolName: 'test_tool',
      operation: 'test operation',
      timestamp: Date.now()
    });
  }
  
  const finalMetrics = handler.getMetrics();
  
  assert(finalMetrics.handledErrors > initialMetrics.handledErrors, 'Error count increased');
  assert(finalMetrics.averageHandlingTime > 0, 'Average handling time is positive');
  assert(typeof finalMetrics.errorTypeDistribution === 'object', 'Error type distribution is object');
  assert(typeof finalMetrics.systemHealth === 'object', 'System health is included in metrics');
}

async function testErrorPatternMatching() {
  console.error('\n🧪 Testing Error Pattern Matching...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test various error patterns
  const testPatterns = [
    { error: new Error('Browser crashed'), expectedType: 'browser' },
    { error: new Error('Connection timeout'), expectedType: 'network' },
    { error: new Error('Element not visible'), expectedType: 'element' },
    { error: new Error('Out of memory'), expectedType: 'memory' },
    { error: new Error('Permission denied'), expectedType: 'permission' }
  ];
  
  for (const pattern of testPatterns) {
    const response = await handler.handleError(pattern.error, {
      toolName: 'test_tool',
      operation: 'test operation',
      timestamp: Date.now()
    });
    
    assertContains(response.error.toLowerCase(), pattern.expectedType, 
      `Error pattern "${pattern.error.message}" matches expected type "${pattern.expectedType}"`);
  }
}

async function testCircuitBreakerIntegration() {
  console.error('\n🧪 Testing Circuit Breaker Integration...');
  
  // Test that circuit breaker state is included in error responses
  const handler = ClaudeErrorHandler.getInstance();
  
  const response = await handler.handleError(mockErrors.browserCrash, {
    toolName: 'test_tool',
    operation: 'test operation',
    timestamp: Date.now()
  });
  
  // Check that degradation level information is present
  if (response.degradationLevel) {
    assertNotEmpty(response.degradationLevel, 'Degradation level information is provided');
  }
  
  // Check that system health information is tracked
  const metrics = handler.getMetrics();
  assert(typeof metrics.systemHealth.circuitBreakerState === 'string', 'Circuit breaker state is tracked');
  assert(typeof metrics.systemHealth.failureRate === 'number', 'Failure rate is tracked');
}

async function testContextualErrorHandling() {
  console.error('\n🧪 Testing Contextual Error Handling...');
  
  const handler = ClaudeErrorHandler.getInstance();
  
  // Test different contexts produce different suggestions
  const browserContext = {
    toolName: 'mcp__playwright__mcp_browser_click',
    operation: 'Click button',
    url: 'https://example.com',
    selector: 'button',
    timestamp: Date.now()
  };
  
  const sessionContext = {
    toolName: 'mcp__playwright__mcp_session_restore',
    operation: 'Restore session',
    sessionName: 'test-user',
    timestamp: Date.now()
  };
  
  const browserResponse = await handler.handleError(mockErrors.elementNotFound, browserContext);
  const sessionResponse = await handler.handleError(mockErrors.sessionExpired, sessionContext);
  
  // Browser context should mention selectors
  const hasSelectorSuggestion = browserResponse.suggestions.some(s => 
    s.toLowerCase().includes('selector') || s.toLowerCase().includes('element')
  );
  assert(hasSelectorSuggestion, 'Browser context error mentions selectors');
  
  // Session context should mention authentication
  const hasSessionSuggestion = sessionResponse.suggestions.some(s => 
    s.toLowerCase().includes('session') || s.toLowerCase().includes('auth')
  );
  assert(hasSessionSuggestion, 'Session context error mentions authentication');
}

async function testHandleToolErrorFunction() {
  console.error('\n🧪 Testing handleToolError Convenience Function...');
  
  const response = await handleToolError(
    mockErrors.networkTimeout,
    'test_tool',
    'test operation',
    {
      url: 'https://example.com',
      parameters: { timeout: 30000 }
    }
  );
  
  assert(typeof response.error === 'string', 'handleToolError returns error message');
  assert(Array.isArray(response.suggestions), 'handleToolError returns suggestions array');
  assert(typeof response.fallbackAvailable === 'boolean', 'handleToolError returns fallback availability');
  assert(typeof response.canRetry === 'boolean', 'handleToolError returns retry capability');
}

// Performance testing
async function testPerformanceUnderLoad() {
  if (!TEST_CONFIG.performance) {
    console.error('\n⏭️  Skipping performance tests (disabled in config)');
    return;
  }
  
  console.error('\n🧪 Testing Performance Under Load...');
  
  const handler = ClaudeErrorHandler.getInstance();
  const startTime = Date.now();
  
  // Execute many error handling operations
  const promises = [];
  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    const promise = handler.handleError(mockErrors.browserCrash, {
      toolName: 'test_tool',
      operation: `test operation ${i}`,
      timestamp: Date.now()
    });
    promises.push(promise);
  }
  
  await Promise.all(promises);
  
  const duration = Date.now() - startTime;
  const averageTime = duration / TEST_CONFIG.iterations;
  
  console.error(`[Performance] Handled ${TEST_CONFIG.iterations} errors in ${duration}ms (${averageTime.toFixed(2)}ms avg)`);
  
  assert(averageTime < 50, 'Average error handling time under 50ms');
  assert(duration < 5000, 'Total time under 5 seconds for 100 operations');
  
  const metrics = handler.getMetrics();
  assert(metrics.averageHandlingTime < 50, 'Metrics show average handling time under 50ms');
}

// Main test runner
async function runAllTests() {
  console.error('🚀 Starting Claude-Aware Error Handling Test Suite (Phase 3D)');
  console.error('================================================================');
  
  try {
    // Core functionality tests
    await testErrorClassification();
    await testClaudeErrorTranslation();
    await testRecoverySuggestions();
    await testFallbackToolDetection();
    await testRecoveryTimeEstimates();
    
    // Integration tests
    await testMCPIntegrationWrapper();
    await testCircuitBreakerIntegration();
    await testContextualErrorHandling();
    await testHandleToolErrorFunction();
    
    // Pattern and classification tests
    await testErrorPatternMatching();
    
    // Performance and metrics tests
    await testPerformanceMetrics();
    await testPerformanceUnderLoad();
    
  } catch (error) {
    console.error(`💥 Test suite crashed: ${error.message}`);
    testResults.failed++;
    testResults.details.push({ test: 'Test suite execution', status: 'CRASHED', error: error.message });
  }
  
  // Print results summary
  console.error('\n================================================================');
  console.error('🏁 Claude-Aware Error Handling Test Results');
  console.error('================================================================');
  
  const duration = Date.now() - testResults.startTime;
  const successRate = testResults.total > 0 ? (testResults.passed / testResults.total * 100).toFixed(1) : '0.0';
  
  console.error(`✅ Passed: ${testResults.passed}`);
  console.error(`❌ Failed: ${testResults.failed}`);
  console.error(`📊 Total: ${testResults.total}`);
  console.error(`⏱️  Duration: ${duration}ms`);
  console.error(`🎯 Success Rate: ${successRate}%`);
  
  if (testResults.failed > 0) {
    console.error('\n❌ Failed Tests:');
    testResults.details.forEach(detail => {
      if (detail.status === 'FAILED' || detail.status === 'CRASHED') {
        console.error(`   • ${detail.test}${detail.error ? `: ${detail.error}` : ''}`);
      }
    });
  }
  
  // Export detailed results
  const resultsFile = path.join(process.cwd(), 'claude-error-handler-test-results.json');
  const detailedResults = {
    ...testResults,
    duration,
    successRate: parseFloat(successRate),
    timestamp: new Date().toISOString(),
    config: TEST_CONFIG,
    metrics: getErrorHandlingMetrics()
  };
  
  try {
    await fs.promises.writeFile(resultsFile, JSON.stringify(detailedResults, null, 2));
    console.error(`📁 Detailed results exported to: ${resultsFile}`);
  } catch (error) {
    console.error(`⚠️  Could not export results: ${error.message}`);
  }
  
  // Exit with appropriate code
  const exitCode = testResults.failed === 0 ? 0 : 1;
  
  if (exitCode === 0) {
    console.error('\n🎉 All tests passed! Claude-aware error handling is working correctly.');
  } else {
    console.error('\n💥 Some tests failed. Please review the errors above.');
  }
  
  process.exit(exitCode);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('💥 Test runner crashed:', error);
    process.exit(1);
  });
}