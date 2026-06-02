// Import from bundled MCP server since core modules are bundled
const mcpServer = require('../dist/mcp/server.cjs');

// Create test classes manually for testing
const { SmartNormalizer } = require('../src/core/smart-normalizer.ts');
const { BidirectionalCache } = require('../src/core/bidirectional-cache.ts');
const { TieredCache } = require('../src/core/bidirectional-cache.ts');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test setup
const testCacheDir = path.join(os.tmpdir(), 'claude-playwright-test-cache');

function cleanup() {
  try {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true });
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Create test cache directory
if (!fs.existsSync(testCacheDir)) {
  fs.mkdirSync(testCacheDir, { recursive: true });
}

console.log('🧪 Starting Bidirectional Cache Tests...');

// Test 0: Snapshot functionality
async function testSnapshotCache() {
  console.log('\n📸 Testing Snapshot Cache...');
  
  const cache = new BidirectionalCache({
    maxSizeMB: 10,
    snapshotTTL: 30000 // 30 seconds for testing
  });
  
  let passed = 0;
  let failed = 0;
  
  try {
    // Test 1: Basic snapshot set/get
    const testSnapshot = {
      name: 'root',
      children: [{ name: 'button', role: 'button' }]
    };
    
    const key = { url: 'http://test.com', domHash: 'test-hash-123' };
    
    await cache.setSnapshot(key, testSnapshot, {
      url: 'http://test.com',
      profile: 'test-profile'
    });
    
    const retrieved = await cache.getSnapshot(key, 'test-profile');
    
    if (JSON.stringify(retrieved) === JSON.stringify(testSnapshot)) {
      console.log('  ✅ Basic snapshot set/get works');
      passed++;
    } else {
      console.log('  ❌ Basic snapshot set/get failed');
      failed++;
    }
    
    // Test 2: Profile isolation
    const retrieved2 = await cache.getSnapshot(key, 'different-profile');
    if (retrieved2 === null) {
      console.log('  ✅ Profile isolation works');
      passed++;
    } else {
      console.log('  ❌ Profile isolation failed');
      failed++;
    }
    
    // Test 3: TTL expiration (short TTL)
    const shortCache = new BidirectionalCache({ snapshotTTL: 1 }); // 1ms
    await shortCache.setSnapshot(key, testSnapshot, { url: 'http://test.com' });
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const expired = await shortCache.getSnapshot(key);
    if (expired === null) {
      console.log('  ✅ TTL expiration works');
      passed++;
    } else {
      console.log('  ❌ TTL expiration failed');
      failed++;
    }
    
    shortCache.close();
    
    // Test 4: Snapshot metrics
    const metrics = await cache.getSnapshotMetrics();
    if (metrics && typeof metrics.total_snapshots === 'number') {
      console.log('  ✅ Snapshot metrics work');
      passed++;
    } else {
      console.log('  ❌ Snapshot metrics failed');
      failed++;
    }
    
  } catch (error) {
    console.error('  ❌ Snapshot test error:', error.message);
    failed++;
  } finally {
    cache.close();
  }
  
  console.log(`  📊 Snapshot Cache: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test 1: SmartNormalizer
async function testSmartNormalizer() {
  console.log('\n📝 Testing SmartNormalizer...');
  
  const normalizer = new SmartNormalizer();
  
  // Test equivalence classes
  const testCases = [
    {
      name: 'Action synonyms',
      inputs: [
        'Click Add Todo button',
        'press Add Todo button',
        'tap Add Todo button',
        'hit Add Todo button'
      ],
      shouldMatch: true
    },
    {
      name: 'Article variations',
      inputs: [
        'Click the Submit button',
        'Click Submit button',
        'Click a Submit button'
      ],
      shouldMatch: true
    },
    {
      name: 'Word order variations',
      inputs: [
        'Click Add Todo button',
        'Click button Add Todo'
      ],
      shouldMatch: true
    },
    {
      name: 'Position sensitive (should NOT match)',
      inputs: [
        'Click first Submit button',
        'Click last Submit button'
      ],
      shouldMatch: false
    },
    {
      name: 'Case variations',
      inputs: [
        'CLICK ADD TODO BUTTON',
        'click add todo button',
        'Click Add Todo Button'
      ],
      shouldMatch: true
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const normalizedResults = testCase.inputs.map(input => normalizer.normalize(input));
    
    if (testCase.shouldMatch) {
      // All should have same normalized string
      const firstNormalized = normalizedResults[0].normalized;
      const allMatch = normalizedResults.every(result => result.normalized === firstNormalized);
      
      if (allMatch) {
        console.log(`  ✅ ${testCase.name}: All inputs normalized to "${firstNormalized}"`);
        passed++;
      } else {
        console.log(`  ❌ ${testCase.name}: Normalization mismatch`);
        normalizedResults.forEach((result, i) => {
          console.log(`     ${testCase.inputs[i]} → ${result.normalized}`);
        });
        failed++;
      }
    } else {
      // Should have different normalized strings
      const uniqueNormalized = new Set(normalizedResults.map(r => r.normalized));
      
      if (uniqueNormalized.size === normalizedResults.length) {
        console.log(`  ✅ ${testCase.name}: All inputs normalized to different values (correct)`);
        passed++;
      } else {
        console.log(`  ❌ ${testCase.name}: Position-sensitive inputs incorrectly matched`);
        failed++;
      }
    }
  }

  console.log(`  📊 SmartNormalizer: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test 2: BidirectionalCache
async function testBidirectionalCache() {
  console.log('\n🔄 Testing BidirectionalCache...');
  
  const cache = new BidirectionalCache({
    maxSizeMB: 1, // Small for testing
    selectorTTL: 60000, // 1 minute
    cleanupInterval: 10000 // 10 seconds
  });

  let passed = 0;
  let failed = 0;

  try {
    const testUrl = 'http://localhost:3002/test';
    
    // Test 1: Basic set/get
    await cache.set('Click Add Todo button', testUrl, 'button[data-testid="add-todo"]');
    
    const result1 = await cache.get('Click Add Todo button', testUrl);
    if (result1 && result1.selector === 'button[data-testid="add-todo"]') {
      console.log('  ✅ Basic set/get works');
      passed++;
    } else {
      console.log('  ❌ Basic set/get failed');
      failed++;
    }

    // Test 2: Normalized match
    const result2 = await cache.get('press Add Todo button', testUrl);
    if (result2 && result2.selector === 'button[data-testid="add-todo"]') {
      console.log('  ✅ Normalized matching works');
      passed++;
    } else {
      console.log('  ❌ Normalized matching failed');
      failed++;
    }

    // Test 3: Reverse lookup (different input, same selector)
    await cache.set('Submit form', testUrl, 'button[data-testid="add-todo"]'); // Same selector!
    
    const result3 = await cache.get('Press form submission button', testUrl);
    if (result3 && result3.selector === 'button[data-testid="add-todo"]' && result3.source === 'reverse') {
      console.log('  ✅ Reverse lookup works');
      passed++;
    } else {
      console.log('  ❌ Reverse lookup failed', result3);
      failed++;
    }

    // Test 4: Multiple variations learning
    const variations = [
      'Click Add Todo',
      'tap the Add Todo button', 
      'press Add Todo',
      'hit Add Todo button'
    ];

    for (const variation of variations) {
      await cache.set(variation, testUrl, 'button[data-testid="add-todo"]');
    }

    // Should now find via multiple paths
    const result4 = await cache.get('select Add Todo option', testUrl);
    if (result4) {
      console.log(`  ✅ Learning from variations works (${result4.source})`);
      passed++;
    } else {
      console.log('  ❌ Learning from variations failed');
      failed++;
    }

    // Test 5: Statistics
    const stats = await cache.getStats();
    if (stats && stats.storage && stats.storage.unique_selectors > 0) {
      console.log(`  ✅ Statistics work: ${stats.storage.unique_selectors} unique selectors, ${stats.storage.total_mappings} mappings`);
      passed++;
    } else {
      console.log('  ❌ Statistics failed');
      failed++;
    }

  } catch (error) {
    console.log(`  ❌ BidirectionalCache test error: ${error.message}`);
    failed++;
  } finally {
    cache.close();
  }

  console.log(`  📊 BidirectionalCache: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test 3: TieredCache
async function testTieredCache() {
  console.log('\n🏗️ Testing TieredCache...');
  
  const bidirectionalCache = new BidirectionalCache({
    maxSizeMB: 1,
    selectorTTL: 60000
  });
  
  const tieredCache = new TieredCache(bidirectionalCache, {
    memorySize: 10,
    memoryTTL: 30000
  });
  
  // Clear cache before tests to ensure clean state
  await tieredCache.clear();

  let passed = 0;
  let failed = 0;

  try {
    const testUrl = 'http://localhost:3002/test';

    // Test 1: First access (miss)
    const result1 = await tieredCache.get('Click Login button', testUrl);
    if (!result1) {
      console.log('  ✅ First access correctly returns null (miss)');
      passed++;
    } else {
      console.log('  ❌ First access should be miss');
      failed++;
    }

    // Test 2: Set and immediate get (memory hit)
    await tieredCache.set('Click Login button', testUrl, 'button#login');
    const result2 = await tieredCache.get('Click Login button', testUrl);
    
    if (result2 && result2.selector === 'button#login') {
      console.log('  ✅ Memory cache works');
      passed++;
    } else {
      console.log('  ❌ Memory cache failed');
      failed++;
    }

    // Test 3: Wrapper operation
    let operationCalled = false;
    const mockOperation = async (selector) => {
      operationCalled = true;
      if (selector !== 'button#login') {
        throw new Error('Wrong selector');
      }
      return 'success';
    };

    const wrapperResult = await tieredCache.wrapSelectorOperation(
      'Click Login button',
      testUrl,
      mockOperation,
      'fallback-selector'
    );

    if (wrapperResult.result === 'success' && wrapperResult.cached === true && !operationCalled) {
      console.log('  ✅ Wrapper operation uses cache correctly');
      passed++;
    } else {
      console.log('  ❌ Wrapper operation failed');
      failed++;
    }

    // Test 4: Statistics
    const stats = tieredCache.getStats();
    if (stats && stats.tiered && stats.tiered.totalRequests > 0) {
      console.log(`  ✅ TieredCache stats work: ${stats.tiered.totalRequests} requests, ${stats.tiered.overallHitRate.toFixed(1)}% hit rate`);
      passed++;
    } else {
      console.log('  ❌ TieredCache stats failed');
      failed++;
    }

  } catch (error) {
    console.log(`  ❌ TieredCache test error: ${error.message}`);
    failed++;
  } finally {
    tieredCache.close();
  }

  console.log(`  📊 TieredCache: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test 4: Performance benchmark
async function performanceBenchmark() {
  console.log('\n⚡ Performance Benchmark...');
  
  const bidirectionalCache = new BidirectionalCache();
  const tieredCache = new TieredCache(bidirectionalCache);
  
  const testUrl = 'http://localhost:3002/perf-test';
  const testCases = [
    'Click Submit button',
    'Press Add Todo',
    'Tap Delete button',
    'Select Option menu',
    'Type in Email field'
  ];

  // Pre-populate cache
  for (let i = 0; i < testCases.length; i++) {
    await tieredCache.set(testCases[i], testUrl, `selector-${i}`);
  }

  // Benchmark cache hits
  const iterations = 100;
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const testCase = testCases[i % testCases.length];
    await tieredCache.get(testCase, testUrl);
  }
  
  const endTime = Date.now();
  const avgTime = (endTime - startTime) / iterations;
  
  console.log(`  📈 Average cache lookup time: ${avgTime.toFixed(2)}ms`);
  
  const stats = tieredCache.getStats();
  console.log(`  📊 Final hit rate: ${stats.tiered.overallHitRate.toFixed(1)}%`);
  
  tieredCache.close();
  
  return avgTime < 5; // Should be under 5ms average
}

// Run all tests
async function runAllTests() {
  const results = [];
  
  results.push(await testSnapshotCache());
  results.push(await testSmartNormalizer());
  results.push(await testBidirectionalCache());
  results.push(await testTieredCache());
  results.push(await performanceBenchmark());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n🏆 Test Results: ${passed}/${total} test suites passed`);
  
  if (passed === total) {
    console.log('✅ All tests passed! Bidirectional cache system is working correctly.');
    return 0;
  } else {
    console.log('❌ Some tests failed. Please check the implementation.');
    return 1;
  }
}

// Run tests and cleanup
runAllTests()
  .then(exitCode => {
    cleanup();
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('💥 Test suite crashed:', error);
    cleanup();
    process.exit(1);
  });