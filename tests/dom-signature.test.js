#!/usr/bin/env node

/**
 * DOM Signature Infrastructure Test Suite
 * Phase 2.1 - DOM Signature Infrastructure Testing
 * 
 * Tests the hierarchical page fingerprinting system with 3-level DOM signatures.
 */

const { DOMSignatureManager, DOMSignatureUtils, BidirectionalCache } = require('../dist/index.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  CACHE_DIR: path.join(__dirname, '../.test-cache'),
  TIMEOUT: 5000,
  VERBOSE: process.env.DEBUG === '1'
};

// Test utilities
function log(message) {
  if (TEST_CONFIG.VERBOSE) {
    console.log(`[DOM-SIG-TEST] ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Mock HTML content for testing
const MOCK_HTML_SIMPLE = `
<html>
<head><title>Simple Page</title></head>
<body>
  <header>
    <h1>Test Page</h1>
    <nav>
      <a href="/home">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Content Section</h2>
      <button id="primary-btn" class="btn btn-primary">Primary Button</button>
      <input type="text" name="search" placeholder="Search...">
      <form>
        <input type="email" name="email" required>
        <button type="submit">Submit</button>
      </form>
    </section>
  </main>
</body>
</html>
`;

const MOCK_HTML_MODIFIED = `
<html>
<head><title>Modified Page</title></head>
<body>
  <header>
    <h1>Test Page</h1>
    <nav>
      <a href="/home">Home</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Content Section</h2>
      <button id="primary-btn" class="btn btn-primary">Primary Button</button>
      <input type="text" name="search" placeholder="Search...">
      <button id="new-btn" class="btn btn-secondary">New Button</button>
      <form>
        <input type="email" name="email" required>
        <button type="submit">Submit</button>
      </form>
    </section>
  </main>
</body>
</html>
`;

// Test Suite
class DOMSignatureTestSuite {
  constructor() {
    this.domSignatureManager = null;
    this.bidirectionalCache = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  async setup() {
    log('Setting up test environment...');
    
    // Clean test cache directory
    if (fs.existsSync(TEST_CONFIG.CACHE_DIR)) {
      fs.rmSync(TEST_CONFIG.CACHE_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG.CACHE_DIR, { recursive: true });

    // Initialize DOM Signature Manager
    this.domSignatureManager = new DOMSignatureManager({
      cacheTTL: 60000, // 1 minute for testing
      includeTextContent: true,
      includePositions: false,
      maxElementsPerLevel: 20
    });

    // Initialize Bidirectional Cache
    this.bidirectionalCache = new BidirectionalCache({
      maxSizeMB: 10,
      selectorTTL: 300000,
      snapshotTTL: 600000,
      cleanupInterval: 30000
    });

    log('Test environment ready');
  }

  async cleanup() {
    log('Cleaning up test environment...');
    
    if (this.domSignatureManager) {
      this.domSignatureManager.close();
    }
    
    if (this.bidirectionalCache) {
      this.bidirectionalCache.close();
    }

    // Clean test cache directory
    if (fs.existsSync(TEST_CONFIG.CACHE_DIR)) {
      fs.rmSync(TEST_CONFIG.CACHE_DIR, { recursive: true });
    }
    
    log('Cleanup complete');
  }

  async runTest(testName, testFn) {
    this.testResults.total++;
    
    try {
      log(`Running test: ${testName}`);
      await testFn();
      this.testResults.passed++;
      console.log(`✅ ${testName}`);
    } catch (error) {
      this.testResults.failed++;
      console.error(`❌ ${testName}: ${error.message}`);
      if (TEST_CONFIG.VERBOSE) {
        console.error(error.stack);
      }
    }
  }

  // Test 1: Basic DOM Signature Generation
  async testBasicSignatureGeneration() {
    const url = 'http://test.example.com';
    const signature = await this.domSignatureManager.generateSignature(MOCK_HTML_SIMPLE, url);
    
    assert(signature.criticalHash, 'Critical hash should be generated');
    assert(signature.importantHash, 'Important hash should be generated');
    assert(signature.contextHash, 'Context hash should be generated');
    assert(signature.fullSignature.includes(':'), 'Full signature should have hierarchical format');
    assert(DOMSignatureManager.isValidSignature(signature.fullSignature), 'Generated signature should be valid');
    
    log(`Generated signature: ${signature.fullSignature}`);
    log(`Element counts: ${JSON.stringify(signature.elementCounts)}`);
  }

  // Test 2: DOM Signature Caching
  async testSignatureCaching() {
    const url = 'http://test.example.com';
    
    // First generation
    const signature1 = await this.domSignatureManager.generateSignature(MOCK_HTML_SIMPLE, url);
    
    // Second generation (should be cached)
    const signature2 = await this.domSignatureManager.generateSignature(MOCK_HTML_SIMPLE, url);
    
    assert(signature1.fullSignature === signature2.fullSignature, 'Cached signatures should be identical');
    
    const cacheStats = this.domSignatureManager.getCacheStats();
    assert(cacheStats.size > 0, 'Cache should contain entries');
    
    log(`Cache stats: ${JSON.stringify(cacheStats)}`);
  }

  // Test 3: DOM Signature Similarity Calculation
  async testSignatureSimilarity() {
    const url1 = 'http://test.example.com/page1';
    const url2 = 'http://test.example.com/page2';
    
    const signature1 = await this.domSignatureManager.generateSignature(MOCK_HTML_SIMPLE, url1);
    const signature2 = await this.domSignatureManager.generateSignature(MOCK_HTML_MODIFIED, url2);
    
    const similarity = DOMSignatureUtils.calculateSimilarity(signature1.fullSignature, signature2.fullSignature);
    
    assert(similarity >= 0 && similarity <= 1, 'Similarity should be between 0 and 1');
    assert(similarity > 0.5, 'Similar pages should have high similarity score'); // Should be similar since structure is mostly same
    
    log(`Signature similarity: ${similarity.toFixed(3)}`);
  }

  // Test 4: DOM Signature Parsing and Validation
  async testSignatureParsingValidation() {
    const validSignature = 'abc123:def456:789xyz';
    const invalidSignature = 'invalid-signature';
    
    assert(DOMSignatureManager.isValidSignature(validSignature), 'Valid signature should pass validation');
    assert(!DOMSignatureManager.isValidSignature(invalidSignature), 'Invalid signature should fail validation');
    
    const parsed = DOMSignatureManager.parseSignature(validSignature);
    assert(parsed.critical === 'abc123', 'Critical hash should be parsed correctly');
    assert(parsed.important === 'def456', 'Important hash should be parsed correctly');  
    assert(parsed.context === '789xyz', 'Context hash should be parsed correctly');
    
    const invalidParsed = DOMSignatureManager.parseSignature(invalidSignature);
    assert(invalidParsed === null, 'Invalid signature should return null when parsed');
  }

  // Test 5: Cache Key Generation with DOM Signatures
  async testDOMEnhancedCacheKey() {
    const baseKey = 'test-selector';
    const url = 'http://test.example.com';
    
    const enhancedKey = await this.bidirectionalCache.createDOMEnhancedCacheKey(baseKey, MOCK_HTML_SIMPLE, url);
    
    assert(typeof enhancedKey === 'string', 'Enhanced cache key should be a string');
    assert(enhancedKey.length > 0, 'Enhanced cache key should not be empty');
    assert(enhancedKey !== baseKey, 'Enhanced cache key should be different from base key');
    
    log(`Enhanced cache key: ${enhancedKey.substring(0, 16)}...`);
  }

  // Test 6: Bidirectional Cache DOM Signature Integration
  async testBidirectionalCacheIntegration() {
    const url = 'http://test.example.com';
    const input = 'click primary button';
    const selector = '#primary-btn';
    
    // Store with DOM signature
    await this.bidirectionalCache.setWithDOMSignature(input, url, selector, MOCK_HTML_SIMPLE);
    
    // Retrieve with DOM signature fallback
    const result = await this.bidirectionalCache.getWithDOMSignatureFallback(input, url, MOCK_HTML_SIMPLE);
    
    assert(result !== null, 'Should find cached result with DOM signature');
    assert(result.selector === selector, 'Should return correct selector');
    assert(result.source === 'exact' || result.source === 'normalized', 'Should find exact or normalized match');
    
    log(`Retrieved result: ${JSON.stringify({ selector: result.selector, source: result.source, confidence: result.confidence })}`);
  }

  // Test 7: DOM Signature Fallback Matching
  async testDOMSignatureFallbackMatching() {
    const url = 'http://test.example.com';
    const input = 'click primary button';
    const selector = '#primary-btn';
    
    // Store with original HTML
    await this.bidirectionalCache.setWithDOMSignature(input, url, selector, MOCK_HTML_SIMPLE);
    
    // Try to find with slightly modified HTML (should work via DOM signature similarity)
    const result = await this.bidirectionalCache.getWithDOMSignatureFallback(
      'click primary btn', // Slightly different input
      url, 
      MOCK_HTML_MODIFIED // Modified HTML but similar structure
    );
    
    assert(result !== null, 'Should find result via DOM signature fallback');
    assert(result.selector === selector, 'Should return correct selector');
    assert(result.source === 'fuzzy', 'Should indicate fuzzy match');
    
    log(`Fallback result: ${JSON.stringify({ selector: result.selector, source: result.source, confidence: result.confidence })}`);
  }

  // Test 8: DOM Signature Metrics and Health Check
  async testDOMSignatureMetrics() {
    const url = 'http://test.example.com';
    
    // Add some test data
    await this.bidirectionalCache.setWithDOMSignature('click button 1', url, '#btn1', MOCK_HTML_SIMPLE);
    await this.bidirectionalCache.setWithDOMSignature('click button 2', url, '#btn2', MOCK_HTML_SIMPLE);
    
    // Store snapshots with DOM signatures
    await this.bidirectionalCache.setSnapshot(
      { url, domHash: 'test-hash-1' }, 
      { test: 'data1' },
      { url, page: MOCK_HTML_SIMPLE }
    );
    
    await this.bidirectionalCache.setSnapshot(
      { url, domHash: 'test-hash-2' }, 
      { test: 'data2' },
      { url, page: MOCK_HTML_MODIFIED }
    );
    
    const metrics = await this.bidirectionalCache.getDOMSignatureMetrics();
    
    assert(metrics.selector_cache, 'Should have selector cache metrics');
    assert(metrics.snapshot_cache, 'Should have snapshot cache metrics');
    assert(metrics.coverage, 'Should have coverage metrics');
    
    log(`DOM Signature Metrics: ${JSON.stringify(metrics, null, 2)}`);
  }

  // Test 9: Error Handling and Fallbacks
  async testErrorHandlingFallbacks() {
    const url = 'http://test.example.com';
    const invalidHTML = '<invalid><unclosed><tag>';
    
    // Should handle invalid HTML gracefully
    const signature = await this.domSignatureManager.generateSignature(invalidHTML, url);
    
    assert(signature.fullSignature === 'fallback:fallback:fallback', 'Should return fallback signature for invalid HTML');
    
    // Cache key generation should work even with errors
    const cacheKey = await this.bidirectionalCache.createDOMEnhancedCacheKey('test', invalidHTML, url);
    assert(typeof cacheKey === 'string' && cacheKey.length > 0, 'Should generate fallback cache key');
    
    log('Error handling test passed - fallbacks working correctly');
  }

  // Test 10: Performance and Memory Usage
  async testPerformanceMemoryUsage() {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    // Generate many signatures to test performance
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const url = `http://test.example.com/page-${i}`;
      promises.push(this.domSignatureManager.generateSignature(MOCK_HTML_SIMPLE, url));
    }
    
    const signatures = await Promise.all(promises);
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    const memoryDelta = endMemory - startMemory;
    
    assert(signatures.length === 10, 'Should generate all signatures');
    assert(duration < 1000, 'Should complete within 1 second'); // Performance assertion
    assert(memoryDelta < 10 * 1024 * 1024, 'Should not use excessive memory'); // < 10MB
    
    log(`Performance: ${duration}ms for 10 signatures, memory delta: ${Math.round(memoryDelta/1024)}KB`);
  }

  async run() {
    console.log('\n🧪 DOM Signature Infrastructure Test Suite');
    console.log('===========================================');
    
    try {
      await this.setup();

      // Run all tests
      await this.runTest('Basic DOM Signature Generation', () => this.testBasicSignatureGeneration());
      await this.runTest('DOM Signature Caching', () => this.testSignatureCaching());
      await this.runTest('DOM Signature Similarity Calculation', () => this.testSignatureSimilarity());
      await this.runTest('DOM Signature Parsing and Validation', () => this.testSignatureParsingValidation());
      await this.runTest('Cache Key Generation with DOM Signatures', () => this.testDOMEnhancedCacheKey());
      await this.runTest('Bidirectional Cache DOM Signature Integration', () => this.testBidirectionalCacheIntegration());
      await this.runTest('DOM Signature Fallback Matching', () => this.testDOMSignatureFallbackMatching());
      await this.runTest('DOM Signature Metrics and Health Check', () => this.testDOMSignatureMetrics());
      await this.runTest('Error Handling and Fallbacks', () => this.testErrorHandlingFallbacks());
      await this.runTest('Performance and Memory Usage', () => this.testPerformanceMemoryUsage());

    } finally {
      await this.cleanup();
    }

    // Print results
    console.log('\n📊 Test Results');
    console.log('================');
    console.log(`✅ Passed: ${this.testResults.passed}/${this.testResults.total}`);
    console.log(`❌ Failed: ${this.testResults.failed}/${this.testResults.total}`);
    console.log(`📈 Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);

    if (this.testResults.failed === 0) {
      console.log('\n🎉 All tests passed! DOM Signature Infrastructure is working correctly.');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${this.testResults.failed} test(s) failed. Please review the implementation.`);
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new DOMSignatureTestSuite();
  testSuite.run().catch(error => {
    console.error('\n💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { DOMSignatureTestSuite };