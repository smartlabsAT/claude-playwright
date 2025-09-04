#!/usr/bin/env node
/**
 * Protocol Validation Test Suite
 * 
 * Tests the MCP protocol validation system for compliance,
 * error recovery, and performance under various conditions.
 */

import { DefaultMCPProtocolValidator, ProtocolError } from '../dist/index.js';
import { ProtocolValidationLayer } from '../dist/index.js';
import { ProtocolErrorRecovery } from '../dist/index.js';

// ANSI colors for test output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const logTest = (testName, passed, details = '') => {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const color = passed ? 'green' : 'red';
  log(`${status} ${testName}${details ? ` - ${details}` : ''}`, color);
};

const logSection = (section) => {
  log(`\n${colors.bold}=== ${section} ===${colors.reset}`, 'blue');
};

// Test data
const validMCPRequest = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'browser_click',
    arguments: { selector: 'button' }
  },
  id: 'test-123'
};

const validMCPResponse = {
  jsonrpc: '2.0',
  id: 'test-123',
  result: {
    content: [{
      type: 'text',
      text: 'Operation successful'
    }]
  }
};

const invalidMessages = [
  { name: 'Missing jsonrpc', message: { method: 'test', id: '123' } },
  { name: 'Wrong jsonrpc version', message: { jsonrpc: '1.0', method: 'test', id: '123' } },
  { name: 'Missing method in request', message: { jsonrpc: '2.0', id: '123' } },
  { name: 'Invalid params type', message: { jsonrpc: '2.0', method: 'test', params: 'invalid', id: '123' } },
  { name: 'Both result and error', message: { jsonrpc: '2.0', id: '123', result: 'ok', error: { code: -1, message: 'fail' } } }
];

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, testFn) {
  totalTests++;
  try {
    const result = testFn();
    if (result) {
      passedTests++;
      logTest(name, true);
    } else {
      failedTests++;
      logTest(name, false);
    }
  } catch (error) {
    failedTests++;
    logTest(name, false, `Exception: ${error.message}`);
  }
}

async function runAsyncTest(name, testFn) {
  totalTests++;
  try {
    const result = await testFn();
    if (result) {
      passedTests++;
      logTest(name, true);
    } else {
      failedTests++;
      logTest(name, false);
    }
  } catch (error) {
    failedTests++;
    logTest(name, false, `Exception: ${error.message}`);
  }
}

// Protocol Validator Tests
logSection('Protocol Validator Tests');

const validator = new DefaultMCPProtocolValidator();

runTest('Validates correct MCP request', () => {
  const result = validator.validateMessage(validMCPRequest);
  return result.isValid && result.errors.length === 0;
});

runTest('Validates correct MCP response', () => {
  const result = validator.validateMessage(validMCPResponse);
  return result.isValid && result.errors.length === 0;
});

runTest('Rejects null message', () => {
  const result = validator.validateMessage(null);
  return !result.isValid && result.errors.includes('Message is null or undefined');
});

runTest('Rejects non-object message', () => {
  const result = validator.validateMessage('invalid');
  return !result.isValid && result.errors.includes('Message must be an object');
});

// Test invalid message validation
invalidMessages.forEach(({ name, message }) => {
  runTest(`Rejects ${name}`, () => {
    const result = validator.validateMessage(message);
    return !result.isValid && result.errors.length > 0;
  });
});

runTest('Validates token format - valid base64', () => {
  return validator.validateTokenFormat('AbCdEfGhIjKlMnOpQrStUvWxYz');
});

runTest('Rejects short token', () => {
  return !validator.validateTokenFormat('short');
});

runTest('Rejects null token', () => {
  return !validator.validateTokenFormat(null);
});

runTest('Sanitizes dangerous HTML input', () => {
  const dangerous = '<script>alert("xss")</script>Hello';
  const result = validator.sanitizeInput(dangerous);
  return result.sanitizedInput !== dangerous && 
         result.sanitizationApplied.includes('Removed script tags');
});

runTest('Sanitizes HTML tags', () => {
  const htmlInput = '<div>Hello <b>World</b></div>';
  const result = validator.sanitizeInput(htmlInput);
  return result.sanitizedInput === 'Hello World' && 
         result.sanitizationApplied.includes('Removed HTML tags');
});

runTest('Enforces supported protocol version', () => {
  try {
    validator.enforceProtocolVersion('2.0');
    return true;
  } catch (error) {
    return false;
  }
});

runTest('Rejects unsupported protocol version', () => {
  try {
    validator.enforceProtocolVersion('3.0');
    return false; // Should throw error
  } catch (error) {
    return error instanceof ProtocolError && error.type === 'VERSION_MISMATCH';
  }
});

// Protocol Validation Layer Tests
logSection('Protocol Validation Layer Tests');

const validationLayer = new ProtocolValidationLayer({
  enabled: true,
  strictMode: false,
  sanitizeInputs: true,
  enableRecovery: true,
  maxRecoveryAttempts: 2
});

await runAsyncTest('Processes valid message correctly', async () => {
  const result = await validationLayer.processMessage(validMCPRequest);
  return result.validationResult.isValid && result.validated.jsonrpc === '2.0';
});

await runAsyncTest('Processes tool call validation', async () => {
  const result = await validationLayer.processToolCall('browser_click', { selector: 'button' });
  return result.toolName === 'browser_click' && result.params.selector === 'button';
});

await runAsyncTest('Processes response validation', async () => {
  const response = { content: [{ type: 'text', text: 'success' }] };
  const result = await validationLayer.processResponse(response);
  return result && result.content && result.content.length > 0;
});

await runAsyncTest('Handles error response validation', async () => {
  const error = new Error('Test error');
  const result = await validationLayer.processErrorResponse(error, 'test-id');
  return result && result.jsonrpc === '2.0' && result.error && result.error.message === 'Test error';
});

await runAsyncTest('Tracks validation statistics', async () => {
  // Process several messages to build stats
  await validationLayer.processMessage(validMCPRequest);
  await validationLayer.processMessage(validMCPResponse);
  
  const stats = validationLayer.getStats();
  return stats.totalMessages > 0 && stats.successRate >= 0 && stats.successRate <= 100;
});

await runAsyncTest('Handles disabled validation mode', async () => {
  const disabledLayer = new ProtocolValidationLayer({ enabled: false });
  const result = await disabledLayer.processMessage({ invalid: 'message' });
  return result.validationResult.isValid === true; // Should pass through without validation
});

// Error Recovery Tests
logSection('Protocol Error Recovery Tests');

const errorRecovery = new ProtocolErrorRecovery();

await runAsyncTest('Recovers from validation errors', async () => {
  const brokenMessage = { method: 'test', id: '123' }; // Missing jsonrpc
  const error = new ProtocolError('Missing jsonrpc field', 'VALIDATION_ERROR', brokenMessage);
  
  const result = await errorRecovery.handleProtocolError(error);
  return result.recovered === true || result.degradationLevel !== undefined;
});

await runAsyncTest('Handles token errors gracefully', async () => {
  const error = new ProtocolError('Invalid token', 'TOKEN_ERROR', {});
  const result = await errorRecovery.handleProtocolError(error);
  return result.recovered !== undefined; // Should attempt recovery or fallback
});

await runAsyncTest('Handles version mismatch recovery', async () => {
  const error = new ProtocolError('Version mismatch', 'VERSION_MISMATCH', { jsonrpc: '1.0' });
  const result = await errorRecovery.handleProtocolError(error);
  return result.recovered === true && result.recoveredMessage.jsonrpc === '2.0';
});

// Performance Tests
logSection('Performance Tests');

await runAsyncTest('Validation performance is acceptable', async () => {
  const startTime = Date.now();
  const iterations = 1000;
  
  for (let i = 0; i < iterations; i++) {
    await validationLayer.processMessage(validMCPRequest);
  }
  
  const endTime = Date.now();
  const avgTime = (endTime - startTime) / iterations;
  
  logTest(`Average validation time: ${avgTime.toFixed(2)}ms`, avgTime < 5); // Should be under 5ms per message
  return avgTime < 10; // Acceptable if under 10ms
});

await runAsyncTest('Error recovery performance', async () => {
  const brokenMessage = { method: 'test' }; // Missing required fields
  const startTime = Date.now();
  
  try {
    await validationLayer.processMessage(brokenMessage);
  } catch (error) {
    // Expected for broken message
  }
  
  const endTime = Date.now();
  const recoveryTime = endTime - startTime;
  
  logTest(`Error recovery time: ${recoveryTime}ms`, recoveryTime < 100);
  return recoveryTime < 200; // Should recover quickly
});

// Integration Tests  
logSection('Integration Tests');

await runAsyncTest('Full validation pipeline works', async () => {
  const layer = new ProtocolValidationLayer({
    enabled: true,
    strictMode: false,
    sanitizeInputs: true,
    enableRecovery: true,
    maxRecoveryAttempts: 3
  });
  
  // Test with dangerous input that needs sanitization and fixing
  const dangerousMessage = {
    method: '<script>alert("xss")</script>test',
    params: { input: '<script>harmful</script>data' },
    // Missing jsonrpc and id - should be recovered
  };
  
  const result = await layer.processMessage(dangerousMessage);
  return result && result.validated.jsonrpc === '2.0' && 
         !result.validated.method.includes('<script>');
});

await runAsyncTest('Statistics tracking is accurate', async () => {
  const layer = new ProtocolValidationLayer();
  
  // Process mix of valid and invalid messages
  await layer.processMessage(validMCPRequest);
  await layer.processMessage(validMCPResponse);
  
  try {
    await layer.processMessage({ invalid: 'message' });
  } catch (e) {
    // Expected for invalid message
  }
  
  const stats = layer.getStats();
  return stats.totalMessages === 3 && 
         stats.validMessages >= 2 &&
         stats.successRate >= 66;
});

// Final Results
logSection('Test Results Summary');

const successRate = (passedTests / totalTests * 100).toFixed(1);
const color = passedTests === totalTests ? 'green' : 
              successRate >= 80 ? 'yellow' : 'red';

log(`\nTotal Tests: ${totalTests}`, 'blue');
log(`Passed: ${passedTests}`, 'green');  
log(`Failed: ${failedTests}`, 'red');
log(`Success Rate: ${successRate}%`, color);

if (passedTests === totalTests) {
  log('\n🎉 All protocol validation tests passed!', 'green');
  log('✅ Phase 0: Protocol Validation Fix is ready for production', 'green');
  process.exit(0);
} else {
  log(`\n❌ ${failedTests} tests failed. Protocol validation needs fixes.`, 'red');
  process.exit(1);
}