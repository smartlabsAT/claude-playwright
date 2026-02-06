/**
 * Test suite for RetryHelper functionality
 */

const { RetryHelper } = require('../dist/index.cjs');

// Color helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const dim = (text) => `\x1b[90m${text}\x1b[0m`;

console.log('\n🧪 Testing RetryHelper\n');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ${green('✓')} ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`  ${red('✗')} ${name}`);
    console.log(`    ${red(error.message)}`);
  }
}

// Test 1: Successful operation on first try
test('Should succeed on first try', async () => {
  let attempts = 0;
  const result = await RetryHelper.withRetry(async () => {
    attempts++;
    return 'success';
  });

  if (result !== 'success') throw new Error('Expected success result');
  if (attempts !== 1) throw new Error(`Expected 1 attempt, got ${attempts}`);
});

// Test 2: Retry on transient error then succeed
test('Should retry on transient error', async () => {
  let attempts = 0;
  const result = await RetryHelper.withRetry(async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('TimeoutError: Element not found');
    }
    return 'success';
  });

  if (result !== 'success') throw new Error('Expected success result');
  if (attempts !== 3) throw new Error(`Expected 3 attempts, got ${attempts}`);
});

// Test 3: Don't retry on permanent error
test('Should not retry permanent errors', async () => {
  let attempts = 0;
  try {
    await RetryHelper.withRetry(async () => {
      attempts++;
      throw new Error('Invalid selector syntax');
    });
    throw new Error('Should have thrown permanent error');
  } catch (error) {
    if (!error.message.includes('Invalid selector')) {
      throw new Error('Wrong error thrown');
    }
    if (attempts !== 1) throw new Error(`Expected 1 attempt, got ${attempts}`);
  }
});

// Test 4: Error classification
test('Should correctly classify errors', () => {
  // Transient errors
  const transientErrors = [
    new Error('TimeoutError: waiting failed'),
    new Error('Element not found'),
    new Error('Target closed'),
    new Error('Execution context was destroyed')
  ];

  for (const error of transientErrors) {
    if (!RetryHelper.isTransientError(error)) {
      throw new Error(`${error.message} should be classified as transient`);
    }
  }

  // Permanent errors
  const permanentErrors = [
    new Error('Invalid selector: bad syntax'),
    new Error('Security violation'),
    new Error('Permission denied')
  ];

  for (const error of permanentErrors) {
    if (RetryHelper.isTransientError(error)) {
      throw new Error(`${error.message} should be classified as permanent`);
    }
  }
});

// Test 5: Exponential backoff timing
test('Should use exponential backoff', async () => {
  const delays = [];
  let lastTime = Date.now();
  let attempts = 0;

  try {
    await RetryHelper.withRetry(async () => {
      attempts++;
      const now = Date.now();
      if (attempts > 1) {
        delays.push(now - lastTime);
      }
      lastTime = now;
      throw new Error('Timeout exceeded');
    }, {
      maxAttempts: 3,
      baseDelay: 100,
      backoffMultiplier: 2
    });
  } catch (error) {
    // Expected to fail
  }

  // Check delays are increasing (with some tolerance)
  if (delays.length !== 2) throw new Error(`Expected 2 delays, got ${delays.length}`);
  if (delays[0] < 90 || delays[0] > 150) throw new Error(`First delay should be ~100ms, got ${delays[0]}`);
  if (delays[1] < 180 || delays[1] > 250) throw new Error(`Second delay should be ~200ms, got ${delays[1]}`);
});

// Test 6: makeRetriable function wrapper
test('Should make functions retriable', async () => {
  let attempts = 0;
  const unreliableFunction = async (value) => {
    attempts++;
    if (attempts < 2) {
      throw new Error('Network timeout');
    }
    return `Result: ${value}`;
  };

  const retriableFunction = RetryHelper.makeRetriable(unreliableFunction);
  const result = await retriableFunction('test');

  if (result !== 'Result: test') throw new Error('Wrong result');
  if (attempts !== 2) throw new Error(`Expected 2 attempts, got ${attempts}`);
});

// Wait for all tests to complete
setTimeout(() => {
  console.log('\n' + '─'.repeat(50));
  if (passedTests === totalTests) {
    console.log(`${green('✓')} All tests passed! (${passedTests}/${totalTests})`);
    process.exit(0);
  } else {
    console.log(`${red('✗')} Some tests failed: ${passedTests}/${totalTests} passed`);
    process.exit(1);
  }
}, 500);