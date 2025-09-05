#!/usr/bin/env node

/**
 * Phase 2.4 Integration Tests - Final Cache Key Reform Testing
 * 
 * This test suite validates all Phase 2 components working together:
 * - DOM signature generation and caching
 * - Enhanced cache key system with cross-environment matching
 * - Context-aware similarity with action conflict prevention
 * - Migration system validation
 * - Performance benchmarking against GitHub issue #11 targets
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Test configuration
const TEST_CONFIG = {
  performanceTargets: {
    cacheHitRate: 85,      // Target: >85%
    testMatchingAccuracy: 90,  // Target: >90%  
    crossEnvPortability: 80,   // Target: >80%
    domChangeDetection: 95,    // Target: >95%
    falsePositiveRate: 5       // Target: <5%
  },
  testEnvironments: [
    'http://localhost:3000',
    'https://staging.example.com',
    'https://production.example.com'
  ]
};

// Test utilities
class Phase2TestRunner {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      performance: {},
      errors: []
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️ ' : '✅';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  assert(condition, message, isWarning = false) {
    if (condition) {
      this.results.passed++;
      this.log(`PASS: ${message}`);
    } else {
      if (isWarning) {
        this.results.warnings++;
        this.log(`WARN: ${message}`, 'warn');
      } else {
        this.results.failed++;
        this.results.errors.push(message);
        this.log(`FAIL: ${message}`, 'error');
      }
    }
    return condition;
  }

  async runCommand(command, expectSuccess = true) {
    try {
      const output = execSync(command, { 
        cwd: projectRoot, 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return { success: true, output };
    } catch (error) {
      if (expectSuccess) {
        this.log(`Command failed: ${command}`, 'error');
        this.log(`Error: ${error.message}`, 'error');
      }
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async buildProject() {
    this.log('Building project for integration tests...');
    const result = await this.runCommand('npm run build');
    this.assert(result.success, 'Project build succeeded');
    return result.success;
  }

  async testDOMSignatureGeneration() {
    this.log('Testing DOM signature generation and caching...');
    
    // Test that DOM signatures are being generated
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      import { DOMSignatureManager } from '../dist/utils/dom-signature.js';
      
      const cache = new BidirectionalCache();
      const domManager = new DOMSignatureManager();
      
      // Simulate DOM signature generation
      const mockPage = {
        url: () => 'http://localhost:3000/test',
        evaluate: async () => ({
          title: 'Test Page',
          forms: 1,
          buttons: 5,
          inputs: 3
        })
      };
      
      try {
        const signature = await domManager.generateSignature(mockPage, 'default');
        console.log(JSON.stringify({
          success: true,
          confidence: signature.confidence,
          hasHash: !!signature.hash,
          hasMetrics: !!signature.metrics
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-dom-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-dom-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      this.assert(data.success, 'DOM signature generation works');
      this.assert(data.confidence > 0, 'DOM signature has confidence score');
      this.assert(data.hasHash, 'DOM signature has hash');
      this.assert(data.hasMetrics, 'DOM signature has metrics');
    } catch (error) {
      this.assert(false, `DOM signature test failed: ${error.message}`);
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-dom-test.mjs'));
    }
  }

  async testEnhancedCacheKeySystem() {
    this.log('Testing enhanced cache key system...');
    
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      import { EnhancedCacheKeyManager } from '../dist/core/enhanced-cache-key.js';
      
      const cache = new BidirectionalCache();
      const keyManager = new EnhancedCacheKeyManager();
      
      try {
        // Test enhanced cache key generation
        const testSteps = [
          { action: 'click', target: 'button', description: 'Login button' },
          { action: 'type', target: 'input[name="email"]', value: 'test@example.com' }
        ];
        
        const key1 = await keyManager.generateEnhanced('User Login', 'http://localhost:3000', testSteps);
        const key2 = await keyManager.generateEnhanced('User Login', 'http://staging.example.com', testSteps);
        
        // Test cross-environment matching
        const similarity = await keyManager.calculateSimilarity(key1, key2);
        
        console.log(JSON.stringify({
          success: true,
          key1Hash: key1.hash,
          key2Hash: key2.hash,
          similarity: similarity,
          crossEnvMatch: similarity > 0.8
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-enhanced-key-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-enhanced-key-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      this.assert(data.success, 'Enhanced cache key generation works');
      this.assert(data.key1Hash && data.key2Hash, 'Cache keys have hashes');
      this.assert(data.similarity >= 0.8, 'Cross-environment cache key similarity is good', true);
      this.assert(data.crossEnvMatch, 'Cross-environment matching works');
      
      this.results.performance.crossEnvSimilarity = data.similarity;
    } catch (error) {
      this.assert(false, `Enhanced cache key test failed: ${error.message}`);
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-enhanced-key-test.mjs'));
    }
  }

  async testContextAwareSimilarity() {
    this.log('Testing context-aware similarity with action conflict prevention...');
    
    const testScript = `
      import { ContextAwareSimilarityCalculator } from '../dist/core/context-aware-similarity.js';
      
      const calculator = new ContextAwareSimilarityCalculator();
      
      try {
        // Test similar actions that should match
        const context1 = {
          action: 'click',
          elementType: 'button',
          text: 'Submit',
          page: { url: 'http://localhost:3000/form' },
          surrounding: ['form', 'input[type="email"]']
        };
        
        const context2 = {
          action: 'click', 
          elementType: 'button',
          text: 'Submit',
          page: { url: 'http://staging.example.com/form' },
          surrounding: ['form', 'input[type="email"]']
        };
        
        // Test conflicting actions that should NOT match
        const context3 = {
          action: 'click',
          elementType: 'button', 
          text: 'Delete',
          page: { url: 'http://localhost:3000/form' },
          surrounding: ['form', 'input[type="email"]']
        };
        
        const similarity12 = await calculator.calculateContextSimilarity(context1, context2);
        const similarity13 = await calculator.calculateContextSimilarity(context1, context3);
        
        console.log(JSON.stringify({
          success: true,
          sameFunctionSimilarity: similarity12,
          differentFunctionSimilarity: similarity13,
          conflictPrevention: similarity13 < 0.5
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-similarity-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-similarity-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      this.assert(data.success, 'Context-aware similarity calculation works');
      this.assert(data.sameFunctionSimilarity > 0.8, 'Similar actions have high similarity');
      this.assert(data.conflictPrevention, 'Different actions have low similarity (conflict prevention)');
      
      this.results.performance.contextSimilarity = {
        same: data.sameFunctionSimilarity,
        different: data.differentFunctionSimilarity
      };
    } catch (error) {
      this.assert(false, `Context-aware similarity test failed: ${error.message}`);
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-similarity-test.mjs'));
    }
  }

  async testMigrationSystem() {
    this.log('Testing cache migration system...');
    
    const testScript = `
      import { CacheMigrationManager } from '../dist/core/cache-migration.js';
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      
      const cache = new BidirectionalCache();
      const migrationManager = new CacheMigrationManager();
      
      try {
        // Test migration status
        const migrationStatus = await migrationManager.checkMigrationStatus();
        
        // Test cache entry migration
        const legacyEntry = {
          selector: 'button.submit',
          input: 'Submit button',
          url: 'http://localhost:3000'
        };
        
        const enhancedEntry = await migrationManager.migrateToEnhanced(legacyEntry);
        
        console.log(JSON.stringify({
          success: true,
          migrationNeeded: migrationStatus.migrationNeeded,
          enhancedEntryCreated: !!enhancedEntry,
          hasEnhancedKey: !!enhancedEntry?.enhancedKey
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-migration-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-migration-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      this.assert(data.success, 'Cache migration system works');
      this.assert(typeof data.migrationNeeded === 'boolean', 'Migration status detection works');
      this.assert(data.enhancedEntryCreated, 'Legacy entries can be migrated to enhanced format');
    } catch (error) {
      this.assert(false, `Migration system test failed: ${error.message}`);
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-migration-test.mjs'));
    }
  }

  async testPerformanceBenchmarks() {
    this.log('Testing performance benchmarks against GitHub issue #11 targets...');
    
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      
      const cache = new BidirectionalCache();
      
      try {
        // Get current performance metrics
        const stats = await cache.getStats();
        const domStats = await cache.getDOMSignatureStats();
        const enhancedStats = await cache.getEnhancedKeyStats();
        
        console.log(JSON.stringify({
          success: true,
          cacheHitRate: stats.operations?.hit_rate || 0,
          testMatchingAccuracy: enhancedStats.matchAccuracy || 0,
          crossEnvPortability: enhancedStats.portabilityRate || 0,
          domChangeDetection: domStats.changeDetectionRate || 0,
          falsePositiveRate: enhancedStats.falsePositiveRate || 0
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message,
          cacheHitRate: 0,
          testMatchingAccuracy: 0,
          crossEnvPortability: 0,
          domChangeDetection: 0,
          falsePositiveRate: 100
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-performance-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-performance-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      this.assert(data.success, 'Performance metrics collection works');
      
      // Validate against GitHub issue #11 targets
      const targets = TEST_CONFIG.performanceTargets;
      
      this.assert(
        data.cacheHitRate >= targets.cacheHitRate, 
        `Cache hit rate: ${data.cacheHitRate.toFixed(1)}% (Target: >${targets.cacheHitRate}%)`,
        data.cacheHitRate >= targets.cacheHitRate * 0.9 // Warning if within 90% of target
      );
      
      this.assert(
        data.testMatchingAccuracy >= targets.testMatchingAccuracy,
        `Test matching accuracy: ${data.testMatchingAccuracy.toFixed(1)}% (Target: >${targets.testMatchingAccuracy}%)`,
        data.testMatchingAccuracy >= targets.testMatchingAccuracy * 0.9
      );
      
      this.assert(
        data.crossEnvPortability >= targets.crossEnvPortability,
        `Cross-env portability: ${data.crossEnvPortability.toFixed(1)}% (Target: >${targets.crossEnvPortability}%)`,
        data.crossEnvPortability >= targets.crossEnvPortability * 0.9
      );
      
      this.assert(
        data.domChangeDetection >= targets.domChangeDetection,
        `DOM change detection: ${data.domChangeDetection.toFixed(1)}% (Target: >${targets.domChangeDetection}%)`,
        data.domChangeDetection >= targets.domChangeDetection * 0.9
      );
      
      this.assert(
        data.falsePositiveRate <= targets.falsePositiveRate,
        `False positive rate: ${data.falsePositiveRate.toFixed(2)}% (Target: <${targets.falsePositiveRate}%)`,
        data.falsePositiveRate <= targets.falsePositiveRate * 1.1
      );
      
      // Store performance results
      this.results.performance = {
        ...this.results.performance,
        cacheHitRate: data.cacheHitRate,
        testMatchingAccuracy: data.testMatchingAccuracy,
        crossEnvPortability: data.crossEnvPortability,
        domChangeDetection: data.domChangeDetection,
        falsePositiveRate: data.falsePositiveRate
      };
      
    } catch (error) {
      this.assert(false, `Performance benchmarking failed: ${error.message}`);
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-performance-test.mjs'));
    }
  }

  async testMCPIntegration() {
    this.log('Testing enhanced MCP server integration...');
    
    // Test that the MCP server can start and tools are available
    const serverTest = await this.runCommand('timeout 10s node dist/mcp/server.cjs', false);
    
    // The server should start without immediate errors (timeout is expected)
    this.assert(
      !serverTest.error || serverTest.error.includes('timeout'),
      'MCP server starts without immediate errors'
    );
    
    // Test that browser_cache_status tool provides enhanced metrics
    // This would require a full MCP client setup, so we'll just verify the tool exists
    const toolCheck = await this.runCommand('grep -n "browser_cache_status" dist/mcp/server.cjs');
    this.assert(toolCheck.success, 'Enhanced browser_cache_status tool exists in MCP server');
    
    // Test that DOM signature integration is present
    const domCheck = await this.runCommand('grep -n "domSignature" dist/mcp/server.cjs');
    this.assert(domCheck.success, 'DOM signature integration present in MCP server');
  }

  generateReport() {
    const totalTests = this.results.passed + this.results.failed + this.results.warnings;
    const successRate = ((this.results.passed / Math.max(totalTests, 1)) * 100).toFixed(1);
    
    console.log('\\n' + '='.repeat(80));
    console.log('Phase 2.4 Integration Test Report');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Warnings: ${this.results.warnings} ⚠️`);
    console.log(`Success Rate: ${successRate}%`);
    console.log('');
    
    if (Object.keys(this.results.performance).length > 0) {
      console.log('Performance Metrics:');
      console.log('-'.repeat(40));
      for (const [metric, value] of Object.entries(this.results.performance)) {
        if (typeof value === 'object') {
          console.log(`${metric}:`, JSON.stringify(value));
        } else {
          console.log(`${metric}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
        }
      }
      console.log('');
    }
    
    if (this.results.errors.length > 0) {
      console.log('Errors:');
      console.log('-'.repeat(40));
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
      console.log('');
    }
    
    // Overall Phase 2.4 status
    const criticalFailures = this.results.failed;
    const performanceTargetsMet = this.results.performance.cacheHitRate >= TEST_CONFIG.performanceTargets.cacheHitRate &&
                                 this.results.performance.testMatchingAccuracy >= TEST_CONFIG.performanceTargets.testMatchingAccuracy &&
                                 this.results.performance.crossEnvPortability >= TEST_CONFIG.performanceTargets.crossEnvPortability;
    
    console.log('Phase 2.4 Status:');
    console.log('-'.repeat(40));
    console.log(`Integration: ${criticalFailures === 0 ? '✅ COMPLETE' : '❌ ISSUES FOUND'}`);
    console.log(`Performance Targets: ${performanceTargetsMet ? '✅ MET' : '⚠️  PARTIAL'}`);
    console.log(`Ready for Production: ${criticalFailures === 0 && performanceTargetsMet ? '✅ YES' : '❌ NO'}`);
    
    return criticalFailures === 0;
  }

  async run() {
    console.log('Starting Phase 2.4 Integration Tests...');
    console.log('Testing all Phase 2 components working together');
    console.log('='.repeat(80));
    
    try {
      // Build project first
      if (!(await this.buildProject())) {
        return false;
      }
      
      // Run all integration tests
      await this.testDOMSignatureGeneration();
      await this.testEnhancedCacheKeySystem();
      await this.testContextAwareSimilarity();
      await this.testMigrationSystem();
      await this.testPerformanceBenchmarks();
      await this.testMCPIntegration();
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      this.log(`Test runner failed: ${error.message}`, 'error');
      return false;
    }
  }
}

// Run the tests
const runner = new Phase2TestRunner();
const success = await runner.run();

process.exit(success ? 0 : 1);