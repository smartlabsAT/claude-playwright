#!/usr/bin/env node

/**
 * Simple Circuit Breaker Test - Phase 3A
 * 
 * Direct testing of circuit breaker functionality without dependencies
 */

// Direct imports to avoid bundle issues
async function testCircuitBreakerDirect() {
  console.error('🚀 Starting Simple Circuit Breaker Tests - Phase 3A');
  console.error('='.repeat(60));
  
  const { MCPCircuitBreaker, ErrorClassifier, CircuitBreakerOpenError } = await import('../src/core/circuit-breaker.js');
  
  let testsRun = 0;
  let testsPassed = 0;
  
  function test(name, condition) {
    testsRun++;
    if (condition) {
      testsPassed++;
      console.error(`✅ ${name}`);
    } else {
      console.error(`❌ ${name}`);
    }
  }
  
  // Test 1: Error Classification
  console.error('\n🧪 Testing Error Classification...');
  
  const browserError = new Error('Browser crashed unexpectedly');
  const classification = ErrorClassifier.classifyError(browserError);
  test('Browser crash classification', 
    classification.type === 'browser_crash' && 
    classification.retriable && 
    classification.shouldTrip
  );
  
  const elementError = new Error('Element not found: button');
  const elementClassification = ErrorClassifier.classifyError(elementError);
  test('Element not found classification',
    elementClassification.type === 'element_not_found' &&
    elementClassification.retriable &&
    !elementClassification.shouldTrip
  );
  
  // Test 2: Circuit Breaker Basic Functionality
  console.error('\n🧪 Testing Circuit Breaker Core...');
  
  const config = {
    failureThreshold: 0.5,
    timeout: 100,
    monitoringWindow: 1000,
    maxConsecutiveFailures: 3,
    initialBackoffDelay: 50,
    maxBackoffDelay: 500,
    backoffMultiplier: 2,
    halfOpenThreshold: 2
  };
  
  const circuitBreaker = new MCPCircuitBreaker(config);
  
  // Test initial state
  const initialMetrics = circuitBreaker.getMetrics();
  test('Initial state is CLOSED', initialMetrics.state === 'CLOSED');
  test('Initial consecutive failures is 0', initialMetrics.consecutiveFailures === 0);
  
  // Test successful operation
  try {
    const result = await circuitBreaker.execute('test-tool', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'success';
    });
    test('Successful operation returns result', result === 'success');
  } catch (error) {
    test('Successful operation returns result', false);
  }
  
  // Test failure tracking
  let failureCount = 0;
  try {
    await circuitBreaker.execute('test-tool', async () => {
      throw new Error('Test failure');
    });
  } catch (error) {
    failureCount++;
  }
  
  const afterFailureMetrics = circuitBreaker.getMetrics();
  test('Failure increases consecutive failures', afterFailureMetrics.consecutiveFailures === 1);
  
  // Test circuit opening after multiple failures
  console.error('\n🧪 Testing Circuit Opening...');
  
  // Cause enough failures to open circuit
  for (let i = 1; i < config.maxConsecutiveFailures; i++) {
    try {
      await circuitBreaker.execute('test-tool', async () => {
        throw new Error(`Test failure ${i + 1}`);
      });
    } catch (error) {
      // Expected failures
    }
  }
  
  const openMetrics = circuitBreaker.getMetrics();
  test('Circuit opens after max consecutive failures', openMetrics.state === 'OPEN');
  
  // Test circuit breaker open error
  let caughtOpenError = false;
  try {
    await circuitBreaker.execute('test-tool', async () => 'should not execute');
  } catch (error) {
    caughtOpenError = error instanceof CircuitBreakerOpenError;
  }
  
  test('Circuit throws open error when OPEN', caughtOpenError);
  
  // Test metrics collection
  console.error('\n🧪 Testing Metrics Collection...');
  
  const metrics = circuitBreaker.getMetrics();
  test('Metrics contain tool statistics', 
    metrics.toolStats && 
    metrics.toolStats['test-tool'] &&
    metrics.toolStats['test-tool'].totalCalls > 0
  );
  
  test('Metrics show correct failure rate', 
    metrics.failureRate >= 0 && metrics.failureRate <= 1
  );
  
  // Test reset functionality
  console.error('\n🧪 Testing Reset Functionality...');
  
  circuitBreaker.reset();
  const resetMetrics = circuitBreaker.getMetrics();
  test('Reset returns circuit to CLOSED', resetMetrics.state === 'CLOSED');
  test('Reset clears consecutive failures', resetMetrics.consecutiveFailures === 0);
  
  // Test failure analysis
  console.error('\n🧪 Testing Failure Analysis...');
  
  // Generate some failures for analysis
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute('analysis-tool', async () => {
        throw new Error('Analysis test failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  const analysis = circuitBreaker.getFailureAnalysis();
  test('Failure analysis includes recent failures', 
    analysis.recentFailures && 
    analysis.recentFailures.length > 0
  );
  
  test('Failure analysis includes error type distribution',
    analysis.errorTypeDistribution &&
    typeof analysis.errorTypeDistribution === 'object'
  );
  
  test('Failure analysis includes retriable vs non-retriable breakdown',
    analysis.retriableVsNonRetriable &&
    typeof analysis.retriableVsNonRetriable.retriable === 'number' &&
    typeof analysis.retriableVsNonRetriable.nonRetriable === 'number'
  );
  
  // Summary
  console.error('\n' + '='.repeat(60));
  console.error('📊 SIMPLE CIRCUIT BREAKER TEST RESULTS');
  console.error('='.repeat(60));
  
  const passRate = testsRun > 0 ? ((testsPassed / testsRun) * 100).toFixed(1) : '0';
  console.error(`🎯 RESULT: ${testsPassed}/${testsRun} tests passed (${passRate}%)`);
  
  if (passRate >= 90) {
    console.error('\n🎉 SUCCESS: Circuit breaker core functionality is working!');
    console.error('✅ State transitions working');
    console.error('✅ Error classification working');
    console.error('✅ Metrics collection working');
    console.error('✅ Failure analysis working');
    console.error('✅ Ready for integration testing');
  } else {
    console.error('\n❌ Some tests failed - check implementation');
  }
  
  console.error('='.repeat(60));
  return testsPassed === testsRun;
}

testCircuitBreakerDirect().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});