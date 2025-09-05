#!/usr/bin/env node

/**
 * Cross-Environment Cache Key Matching Tests
 * 
 * Tests the ability of enhanced cache keys to work across different environments:
 * - localhost → staging → production URL transitions
 * - Different port numbers and protocols
 * - Similar page structures with different styling/layout
 * - Cache key portability and adaptation mechanisms
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Test environments
const TEST_ENVIRONMENTS = [
  { name: 'localhost', url: 'http://localhost:3000', type: 'development' },
  { name: 'localhost-alt', url: 'http://localhost:8080', type: 'development' },  
  { name: 'staging', url: 'https://staging.myapp.com', type: 'staging' },
  { name: 'production', url: 'https://myapp.com', type: 'production' },
  { name: 'cdn', url: 'https://cdn.myapp.com', type: 'production' }
];

// Test scenarios for cross-environment matching
const TEST_SCENARIOS = [
  {
    name: 'User Authentication Flow',
    steps: [
      { action: 'navigate', target: '/login' },
      { action: 'type', target: 'input[name="email"]', value: 'user@example.com' },
      { action: 'type', target: 'input[name="password"]', value: 'password123' },
      { action: 'click', target: 'button[type="submit"]', description: 'Login button' }
    ]
  },
  {
    name: 'Todo Item Creation',
    steps: [
      { action: 'navigate', target: '/todos' },
      { action: 'type', target: 'input.todo-input', value: 'New task' },
      { action: 'click', target: 'button.add-btn', description: 'Add todo button' }
    ]
  },
  {
    name: 'Product Purchase',
    steps: [
      { action: 'navigate', target: '/products/123' },
      { action: 'click', target: '.buy-now-btn', description: 'Buy now button' },
      { action: 'type', target: 'input[name="quantity"]', value: '2' },
      { action: 'click', target: '.checkout-btn', description: 'Checkout button' }
    ]
  }
];

class CrossEnvironmentTestRunner {
  constructor() {
    this.results = {
      environmentPairs: 0,
      successfulMatches: 0,
      failedMatches: 0,
      adaptations: 0,
      similarities: [],
      errors: []
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️ ' : '✅';
    console.log(`[${timestamp}] ${prefix} ${message}`);
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

  async testCacheKeyGeneration() {
    this.log('Testing cache key generation across environments...');
    
    const results = [];
    
    // Generate cache keys for each scenario in each environment
    for (const scenario of TEST_SCENARIOS) {
      this.log(`Testing scenario: ${scenario.name}`);
      
      const scenarioResults = [];
      
      for (const env of TEST_ENVIRONMENTS) {
        this.log(`  Environment: ${env.name} (${env.url})`);
        
        const testScript = `
          import { EnhancedCacheKeyManager } from '../dist/core/enhanced-cache-key.js';
          
          const keyManager = new EnhancedCacheKeyManager();
          
          try {
            const steps = ${JSON.stringify(scenario.steps)};
            const key = await keyManager.generateEnhanced('${scenario.name}', '${env.url}', steps);
            
            console.log(JSON.stringify({
              success: true,
              environment: '${env.name}',
              url: '${env.url}',
              keyHash: key.hash,
              components: {
                hasStepHashes: key.components.stepHashes.length > 0,
                hasNormalizedUrl: !!key.components.normalizedUrl,
                hasDomContext: !!key.components.domContext,
                hasActionSequence: !!key.components.actionSequence
              }
            }));
          } catch (error) {
            console.log(JSON.stringify({
              success: false,
              environment: '${env.name}',
              error: error.message
            }));
          }
        `;
        
        fs.writeFileSync(join(projectRoot, 'temp-key-gen-test.mjs'), testScript);
        
        try {
          const result = await this.runCommand('node temp-key-gen-test.mjs');
          const data = JSON.parse(result.output.trim());
          scenarioResults.push(data);
          
          if (data.success) {
            this.log(`    ✅ Generated key: ${data.keyHash.substring(0, 8)}...`);
          } else {
            this.log(`    ❌ Failed: ${data.error}`, 'error');
            this.results.errors.push(`${scenario.name} in ${env.name}: ${data.error}`);
          }
        } catch (error) {
          this.log(`    ❌ Script error: ${error.message}`, 'error');
          this.results.errors.push(`${scenario.name} in ${env.name}: Script error`);
        } finally {
          fs.unlinkSync(join(projectRoot, 'temp-key-gen-test.mjs'));
        }
      }
      
      results.push({
        scenario: scenario.name,
        environments: scenarioResults
      });
    }
    
    return results;
  }

  async testCrossEnvironmentSimilarity(keyResults) {
    this.log('Testing cross-environment cache key similarity...');
    
    for (const scenarioResult of keyResults) {
      this.log(`Analyzing similarity for: ${scenarioResult.scenario}`);
      
      const successfulKeys = scenarioResult.environments.filter(env => env.success);
      
      // Test all pairs of environments
      for (let i = 0; i < successfulKeys.length; i++) {
        for (let j = i + 1; j < successfulKeys.length; j++) {
          const env1 = successfulKeys[i];
          const env2 = successfulKeys[j];
          
          this.results.environmentPairs++;
          
          this.log(`  Comparing ${env1.environment} ↔ ${env2.environment}`);
          
          const testScript = `
            import { EnhancedCacheKeyManager } from '../dist/core/enhanced-cache-key.js';
            
            const keyManager = new EnhancedCacheKeyManager();
            
            try {
              // Reconstruct keys (simplified for testing)
              const key1 = { hash: '${env1.keyHash}', components: ${JSON.stringify(env1.components)} };
              const key2 = { hash: '${env2.keyHash}', components: ${JSON.stringify(env2.components)} };
              
              // Calculate similarity using URL normalization and component analysis
              const similarity = await keyManager.calculateSimilarity(key1, key2);
              
              console.log(JSON.stringify({
                success: true,
                env1: '${env1.environment}',
                env2: '${env2.environment}',
                similarity: similarity,
                isMatch: similarity > 0.7,
                isStrongMatch: similarity > 0.85
              }));
            } catch (error) {
              console.log(JSON.stringify({
                success: false,
                env1: '${env1.environment}',
                env2: '${env2.environment}',
                error: error.message,
                similarity: 0
              }));
            }
          `;
          
          fs.writeFileSync(join(projectRoot, 'temp-similarity-test.mjs'), testScript);
          
          try {
            const result = await this.runCommand('node temp-similarity-test.mjs');
            const data = JSON.parse(result.output.trim());
            
            if (data.success) {
              this.results.similarities.push(data.similarity);
              
              if (data.isMatch) {
                this.results.successfulMatches++;
                const matchType = data.isStrongMatch ? 'STRONG' : 'GOOD';
                this.log(`    ✅ ${matchType} match: ${(data.similarity * 100).toFixed(1)}%`);
              } else {
                this.results.failedMatches++;
                this.log(`    ❌ No match: ${(data.similarity * 100).toFixed(1)}%`, 'warn');
              }
            } else {
              this.results.failedMatches++;
              this.log(`    ❌ Similarity test failed: ${data.error}`, 'error');
              this.results.errors.push(`Similarity ${env1.environment}↔${env2.environment}: ${data.error}`);
            }
          } catch (error) {
            this.results.failedMatches++;
            this.log(`    ❌ Script error: ${error.message}`, 'error');
          } finally {
            fs.unlinkSync(join(projectRoot, 'temp-similarity-test.mjs'));
          }
        }
      }
    }
  }

  async testCacheAdaptation() {
    this.log('Testing cache key adaptation capabilities...');
    
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      import { CacheMigrationManager } from '../dist/core/cache-migration.js';
      
      const cache = new BidirectionalCache();
      const migrationManager = new CacheMigrationManager();
      
      try {
        // Test adapting a cache entry from localhost to production
        const sourceEntry = {
          selector: 'button.submit-btn',
          input: 'Submit form',
          url: 'http://localhost:3000/form',
          confidence: 0.9
        };
        
        const targetContext = {
          url: 'https://myapp.com/form',
          domContext: {
            buttons: 3,
            forms: 1,
            inputs: 5
          }
        };
        
        // Simulate adaptation
        const adapted = await migrationManager.adaptCacheEntry(sourceEntry, targetContext);
        
        console.log(JSON.stringify({
          success: true,
          originalUrl: sourceEntry.url,
          adaptedUrl: targetContext.url,
          selectorChanged: adapted.selector !== sourceEntry.selector,
          confidenceAdjusted: adapted.confidence !== sourceEntry.confidence,
          adaptationApplied: adapted.adapted === true
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-adaptation-test.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-adaptation-test.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        if (data.adaptationApplied) {
          this.results.adaptations++;
          this.log(`✅ Cache adaptation successful`);
        } else {
          this.log(`⚠️  No adaptation needed`, 'warn');
        }
        
        this.log(`  Original: ${data.originalUrl}`);
        this.log(`  Adapted: ${data.adaptedUrl}`);
        this.log(`  Selector changed: ${data.selectorChanged}`);
        this.log(`  Confidence adjusted: ${data.confidenceAdjusted}`);
      } else {
        this.log(`❌ Adaptation test failed: ${data.error}`, 'error');
        this.results.errors.push(`Adaptation test: ${data.error}`);
      }
    } catch (error) {
      this.log(`❌ Adaptation script error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-adaptation-test.mjs'));
    }
  }

  async testPortabilityScenarios() {
    this.log('Testing specific portability scenarios...');
    
    // Test common URL transformation scenarios
    const urlTransformations = [
      { from: 'http://localhost:3000', to: 'https://staging.example.com', expected: 'HIGH' },
      { from: 'http://localhost:3000', to: 'https://example.com', expected: 'HIGH' },
      { from: 'https://staging.example.com', to: 'https://example.com', expected: 'VERY_HIGH' },
      { from: 'http://localhost:8080', to: 'http://localhost:3000', expected: 'MEDIUM' },
      { from: 'https://api.example.com', to: 'https://example.com', expected: 'LOW' }
    ];
    
    for (const transformation of urlTransformations) {
      this.log(`Testing portability: ${transformation.from} → ${transformation.to}`);
      
      const testScript = `
        import { EnhancedCacheKeyManager } from '../dist/core/enhanced-cache-key.js';
        
        const keyManager = new EnhancedCacheKeyManager();
        
        try {
          const steps = [
            { action: 'click', target: 'button.primary', description: 'Main button' }
          ];
          
          const key1 = await keyManager.generateEnhanced('Test Action', '${transformation.from}', steps);
          const key2 = await keyManager.generateEnhanced('Test Action', '${transformation.to}', steps);
          
          const similarity = await keyManager.calculateSimilarity(key1, key2);
          
          // Determine portability level
          let portabilityLevel = 'LOW';
          if (similarity > 0.9) portabilityLevel = 'VERY_HIGH';
          else if (similarity > 0.8) portabilityLevel = 'HIGH';
          else if (similarity > 0.6) portabilityLevel = 'MEDIUM';
          
          console.log(JSON.stringify({
            success: true,
            from: '${transformation.from}',
            to: '${transformation.to}',
            similarity: similarity,
            portabilityLevel: portabilityLevel,
            expectedLevel: '${transformation.expected}',
            meetsExpectation: portabilityLevel === '${transformation.expected}' || 
                            (portabilityLevel === 'VERY_HIGH' && '${transformation.expected}' === 'HIGH')
          }));
        } catch (error) {
          console.log(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      `;
      
      fs.writeFileSync(join(projectRoot, 'temp-portability-test.mjs'), testScript);
      
      try {
        const result = await this.runCommand('node temp-portability-test.mjs');
        const data = JSON.parse(result.output.trim());
        
        if (data.success) {
          const status = data.meetsExpectation ? '✅' : '⚠️';
          this.log(`  ${status} Portability: ${data.portabilityLevel} (${(data.similarity * 100).toFixed(1)}%)`);
          this.log(`    Expected: ${data.expectedLevel}, Got: ${data.portabilityLevel}`);
        } else {
          this.log(`  ❌ Test failed: ${data.error}`, 'error');
        }
      } catch (error) {
        this.log(`  ❌ Script error: ${error.message}`, 'error');
      } finally {
        fs.unlinkSync(join(projectRoot, 'temp-portability-test.mjs'));
      }
    }
  }

  generateReport() {
    const totalPairs = this.results.environmentPairs;
    const successRate = totalPairs > 0 ? ((this.results.successfulMatches / totalPairs) * 100).toFixed(1) : 0;
    const avgSimilarity = this.results.similarities.length > 0 ? 
      (this.results.similarities.reduce((a, b) => a + b, 0) / this.results.similarities.length) : 0;
    
    console.log('\\n' + '='.repeat(80));
    console.log('Cross-Environment Cache Key Matching Report');
    console.log('='.repeat(80));
    console.log(`Environment Pairs Tested: ${totalPairs}`);
    console.log(`Successful Matches: ${this.results.successfulMatches}`);
    console.log(`Failed Matches: ${this.results.failedMatches}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Average Similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
    console.log(`Adaptations Performed: ${this.results.adaptations}`);
    console.log('');
    
    // Performance evaluation
    console.log('Performance Evaluation:');
    console.log('-'.repeat(40));
    console.log(`Portability Rate: ${successRate}% ${parseFloat(successRate) >= 80 ? '✅' : '❌'} (Target: ≥80%)`);
    console.log(`Average Similarity: ${(avgSimilarity * 100).toFixed(1)}% ${avgSimilarity >= 0.75 ? '✅' : '❌'} (Target: ≥75%)`);
    console.log('');
    
    if (this.results.errors.length > 0) {
      console.log('Errors:');
      console.log('-'.repeat(40));
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
      console.log('');
    }
    
    const success = parseFloat(successRate) >= 80 && avgSimilarity >= 0.75;
    console.log(`Overall Status: ${success ? '✅ PASSED' : '❌ NEEDS IMPROVEMENT'}`);
    
    return success;
  }

  async run() {
    console.log('Starting Cross-Environment Cache Key Matching Tests...');
    console.log(`Testing ${TEST_ENVIRONMENTS.length} environments with ${TEST_SCENARIOS.length} scenarios`);
    console.log('='.repeat(80));
    
    try {
      // Generate cache keys for all scenarios/environments
      const keyResults = await this.testCacheKeyGeneration();
      
      // Test cross-environment similarity
      await this.testCrossEnvironmentSimilarity(keyResults);
      
      // Test adaptation capabilities
      await this.testCacheAdaptation();
      
      // Test specific portability scenarios
      await this.testPortabilityScenarios();
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      this.log(`Test runner failed: ${error.message}`, 'error');
      return false;
    }
  }
}

// Run the tests
const runner = new CrossEnvironmentTestRunner();
const success = await runner.run();

process.exit(success ? 0 : 1);