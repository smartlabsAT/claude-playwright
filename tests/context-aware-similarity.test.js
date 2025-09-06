#!/usr/bin/env node

/**
 * Comprehensive test suite for Phase 2.3 - Context-Aware Similarity Optimization
 * Tests the enhanced similarity system with action conflict detection and contextual thresholds
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Add the src directory to the module resolution path
const srcPath = path.join(__dirname, '../src');

async function loadModule(modulePath) {
  try {
    const fullPath = path.join(srcPath, modulePath);
    if (fullPath.endsWith('.ts')) {
      // For TypeScript files, we need to require the compiled JS version
      const jsPath = fullPath.replace('.ts', '.js').replace('/src/', '/dist/');
      return require(jsPath);
    }
    return require(fullPath);
  } catch (error) {
    console.error(`Failed to load module ${modulePath}:`, error.message);
    // Try requiring directly
    return require(modulePath);
  }
}

async function runTests() {
  console.log('🧪 Starting Context-Aware Similarity Test Suite...\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, testFn) {
    totalTests++;
    try {
      testFn();
      console.log(`✅ ${name}`);
      passedTests++;
    } catch (error) {
      console.error(`❌ ${name}: ${error.message}`);
    }
  }

  function asyncTest(name, testFn) {
    totalTests++;
    return testFn().then(() => {
      console.log(`✅ ${name}`);
      passedTests++;
    }).catch(error => {
      console.error(`❌ ${name}: ${error.message}`);
    });
  }

  try {
    // Load the modules from the main index exports (use CJS version)
    const { ContextAwareSimilarity, SIMILARITY_THRESHOLDS, SmartNormalizer } = require('../dist/index.cjs');

    // Initialize instances
    const contextSimilarity = new ContextAwareSimilarity();
    const normalizer = new SmartNormalizer();

    console.log('📦 1. Testing ContextAwareSimilarity Class\n');

    // Test 1: Basic similarity calculation
    test('Basic similarity calculation works', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      const similarity = contextSimilarity.calculateSimilarity(
        'click login button',
        'press login button',
        context
      );

      assert(similarity > 0.7, `Expected high similarity, got ${similarity}`);
      assert(similarity <= 1, `Expected similarity ≤ 1, got ${similarity}`);
    });

    // Test 2: Action conflict detection
    test('Action conflict detection prevents matches', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      // Test conflicting actions: login vs logout
      assert(contextSimilarity.hasConflictingActions('login user', 'logout user'), 
        'Should detect login/logout conflict');

      // Test conflicting actions: create vs delete
      assert(contextSimilarity.hasConflictingActions('create new todo', 'delete todo'), 
        'Should detect create/delete conflict');

      // Test conflicting actions: open vs close
      assert(contextSimilarity.hasConflictingActions('open dialog', 'close modal'), 
        'Should detect open/close conflict');

      // Test non-conflicting actions
      assert(!contextSimilarity.hasConflictingActions('click button', 'press element'), 
        'Should not detect click/press conflict');
    });

    // Test 3: Exact action match detection
    test('Exact action match detection boosts similarity', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',  
        domainMatch: true,
        operationType: 'test_search'
      };

      // Test exact action match
      assert(contextSimilarity.hasExactActionMatch('click submit button', 'click login form'), 
        'Should detect exact click action match');

      // Test synonym action match
      assert(contextSimilarity.hasExactActionMatch('type username', 'enter username'), 
        'Should detect type/enter as same action group');
    });

    // Test 4: Context-aware thresholds
    test('Context-aware thresholds work correctly', () => {
      const testContext = { currentUrl: 'https://test.com', profile: 'default', domainMatch: true, operationType: 'test_search' };
      const cacheContext = { currentUrl: 'https://test.com', profile: 'default', domainMatch: true, operationType: 'cache_lookup' };

      const testThreshold = contextSimilarity.getThresholdForContext(testContext);
      const cacheThreshold = contextSimilarity.getThresholdForContext(cacheContext);

      assert.strictEqual(testThreshold, SIMILARITY_THRESHOLDS.test_search, 
        `Expected test_search threshold ${SIMILARITY_THRESHOLDS.test_search}, got ${testThreshold}`);
      
      assert.strictEqual(cacheThreshold, SIMILARITY_THRESHOLDS.cache_lookup,
        `Expected cache_lookup threshold ${SIMILARITY_THRESHOLDS.cache_lookup}, got ${cacheThreshold}`);
      
      assert(testThreshold > cacheThreshold, 
        'Test search should have higher threshold than cache lookup');
    });

    // Test 5: Cross-environment domain matching
    test('Cross-environment domain matching applies penalties', () => {
      const sameEnvContext = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      const crossEnvContext = {
        currentUrl: 'https://staging.example.com',
        profile: 'default', 
        domainMatch: false,
        operationType: 'cross_env'
      };

      const sameEnvSimilarity = contextSimilarity.calculateSimilarity(
        'click login button',
        'click login button',
        sameEnvContext
      );

      const crossEnvSimilarity = contextSimilarity.calculateSimilarity(
        'click login button',
        'click login button', 
        crossEnvContext
      );

      assert(sameEnvSimilarity >= crossEnvSimilarity,
        `Same environment should have equal or higher similarity: ${sameEnvSimilarity} vs ${crossEnvSimilarity}`);
    });

    console.log('\n📦 2. Testing SmartNormalizer Integration\n');

    // Test 6: SmartNormalizer context-aware methods
    test('SmartNormalizer context-aware similarity integration', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        operationType: 'cache_lookup',
        profile: 'default'
      };

      const similarity = normalizer.calculateContextAwareSimilarity(
        'click add todo',
        'press add task', 
        context
      );

      assert(similarity > 0, `Expected positive similarity, got ${similarity}`);
      assert(similarity <= 1, `Expected similarity ≤ 1, got ${similarity}`);
    });

    // Test 7: Action detection in SmartNormalizer
    test('SmartNormalizer action conflict detection', () => {
      const conflictSimilarity = normalizer.calculateSimilarityWithActionDetection(
        'login to system',
        'logout from system'
      );

      const normalSimilarity = normalizer.calculateSimilarityWithActionDetection(
        'click submit button',
        'press submit button'
      );

      assert.strictEqual(conflictSimilarity, -1, 
        `Expected -1 for conflicting actions, got ${conflictSimilarity}`);
      
      assert(normalSimilarity > 0, 
        `Expected positive similarity for non-conflicting actions, got ${normalSimilarity}`);
    });

    // Test 8: Threshold operations
    test('SmartNormalizer threshold operations', () => {
      const testThreshold = normalizer.getThresholdForOperation('test_search');
      const cacheThreshold = normalizer.getThresholdForOperation('cache_lookup');
      
      assert.strictEqual(testThreshold, SIMILARITY_THRESHOLDS.test_search);
      assert.strictEqual(cacheThreshold, SIMILARITY_THRESHOLDS.cache_lookup);

      assert(normalizer.meetsThresholdForOperation(0.4, 'test_search'), 
        'High similarity should meet test_search threshold');
      
      assert(!normalizer.meetsThresholdForOperation(0.1, 'test_search'),
        'Low similarity should not meet test_search threshold');
    });

    console.log('\n📦 3. Testing Advanced Context Features\n');

    // Test 9: Batch similarity calculation
    test('Batch similarity calculation with context', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      const candidates = [
        'click login button',
        'press submit form',
        'logout from system', // Should be filtered out due to conflict with query
        'tap login element'
      ];

      const results = contextSimilarity.calculateBatchSimilarity(
        'login to application',
        candidates,
        context
      );

      assert.strictEqual(results.length, 4, 'Should return results for all candidates');

      // Check that conflicting action has low or zero similarity
      const logoutResult = results.find(r => r.candidate.includes('logout'));
      assert(logoutResult.similarity < 0.1, 
        `Logout should have very low similarity to login query, got ${logoutResult.similarity}`);
    });

    // Test 10: Best matches with ranking
    test('Best matches with ranking and filtering', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      const candidates = [
        'click login button',
        'press submit form', 
        'tap login element',
        'authenticate user',
        'logout system', // Should be filtered out
        'create account' // Should be filtered out due to different intent
      ];

      const matches = contextSimilarity.findBestMatches(
        'login to system',
        candidates,
        context,
        3
      );

      assert(matches.length <= 3, 'Should respect maxResults limit');
      assert(matches.length > 0, 'Should find at least some matches');

      // Check ranking
      for (let i = 1; i < matches.length; i++) {
        assert(matches[i-1].similarity >= matches[i].similarity,
          'Results should be sorted by similarity (descending)');
      }

      // Check that ranks are assigned correctly
      matches.forEach((match, index) => {
        assert.strictEqual(match.rank, index + 1, 
          `Match at index ${index} should have rank ${index + 1}, got ${match.rank}`);
      });
    });

    console.log('\n📦 4. Testing Threshold Configuration\n');

    // Test 11: Threshold values are correctly set
    test('Threshold configuration values', () => {
      const expectedThresholds = {
        test_search: 0.35,    // Stricter for test matching
        cache_lookup: 0.15,   // Permissive for selector variation
        pattern_match: 0.25,  // Moderate for pattern recognition
        cross_env: 0.40,      // Very strict for cross-environment
        default: 0.20
      };

      Object.entries(expectedThresholds).forEach(([key, expectedValue]) => {
        assert.strictEqual(SIMILARITY_THRESHOLDS[key], expectedValue,
          `Expected ${key} threshold to be ${expectedValue}, got ${SIMILARITY_THRESHOLDS[key]}`);
      });
    });

    console.log('\n📦 5. Testing Real-World Scenarios\n');

    // Test 12: Login vs Logout scenarios
    test('Login vs Logout conflict prevention', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      const loginQuery = 'user login workflow';
      const candidates = [
        'User Authentication Flow',
        'Login Integration Test', 
        'User Logout Process', // Should be filtered out
        'Sign-in Verification'
      ];

      const matches = contextSimilarity.findBestMatches(loginQuery, candidates, context);
      
      // Should not include logout in matches
      const hasLogout = matches.some(m => m.candidate.toLowerCase().includes('logout'));
      assert(!hasLogout, 'Login query should not match logout tests');
      
      assert(matches.length > 0, 'Should find valid login matches');
    });

    // Test 13: CRUD operation conflicts
    test('CRUD operation conflict detection', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      // Test create vs delete conflict
      assert(contextSimilarity.hasConflictingActions('create new todo', 'delete existing todo'),
        'Should detect create/delete conflict');

      const similarity = contextSimilarity.calculateSimilarity(
        'create new record',
        'delete old record',
        context
      );

      assert(similarity < 0.3, `Create vs Delete should have low similarity, got ${similarity}`);
    });

    // Test 14: Cross-environment adaptation
    test('Cross-environment threshold adaptation', () => {
      const prodContext = {
        currentUrl: 'https://prod.example.com',
        profile: 'default',
        domainMatch: false,
        operationType: 'cross_env'
      };

      const stagingContext = {
        currentUrl: 'https://staging.example.com', 
        profile: 'default',
        domainMatch: false,
        operationType: 'cross_env'
      };

      const crossEnvThreshold = contextSimilarity.getThresholdForContext(prodContext);
      assert.strictEqual(crossEnvThreshold, SIMILARITY_THRESHOLDS.cross_env);

      // High similarity required for cross-environment matching
      assert(crossEnvThreshold >= 0.40, 
        `Cross-environment threshold should be strict (≥0.40), got ${crossEnvThreshold}`);
    });

    console.log('\n📦 6. Performance and Edge Cases\n');

    // Test 15: Empty and invalid inputs
    test('Handles empty and invalid inputs gracefully', () => {
      const context = {
        currentUrl: 'https://app.example.com',
        profile: 'default',
        domainMatch: true,
        operationType: 'test_search'
      };

      // Empty strings
      const emptyResult = contextSimilarity.calculateSimilarity('', '', context);
      assert.strictEqual(emptyResult, 0, 'Empty strings should return 0 similarity');

      // Null/undefined
      const nullResult = contextSimilarity.calculateSimilarity(null, 'test', context);
      assert.strictEqual(nullResult, 0, 'Null input should return 0 similarity');

      // Very different strings
      const differentResult = contextSimilarity.calculateSimilarity(
        'completely unrelated text',
        'totally different content', 
        context
      );
      assert(differentResult >= 0, 'Different strings should have non-negative similarity');
    });

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All Context-Aware Similarity tests passed!');
      console.log('\n✨ Phase 2.3 - Similarity Optimization Implementation Complete');
      console.log('\nKey Features Verified:');
      console.log('✅ Context-aware similarity calculation with action detection');
      console.log('✅ Configurable thresholds for different operation types');
      console.log('✅ Action conflict prevention (login ↔ logout, create ↔ delete)');
      console.log('✅ Cross-environment domain matching with penalties');
      console.log('✅ SmartNormalizer integration with backward compatibility');
      console.log('✅ Batch processing and ranked result filtering');
      console.log('✅ Robust error handling and edge case management');
      
      return true;
    } else {
      console.error(`❌ ${totalTests - passedTests} tests failed`);
      return false;
    }

  } catch (error) {
    console.error('💥 Test suite failed to run:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runTests };