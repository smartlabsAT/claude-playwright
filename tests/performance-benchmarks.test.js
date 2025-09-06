#!/usr/bin/env node

/**
 * Performance Benchmarking System for Phase 2.4
 * 
 * Validates performance targets from GitHub issue #11:
 * - Cache hit rate: >85% (current: ~70%)
 * - Test matching accuracy: >90% (current: ~60%)  
 * - Cross-env portability: >80% (current: <30%)
 * - DOM change detection: >95%
 * - False positive rate: <5%
 * 
 * Also includes stress testing and performance regression detection.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Performance targets from GitHub issue #11
const PERFORMANCE_TARGETS = {
  cacheHitRate: 85,      // >85%
  testMatchingAccuracy: 90,  // >90%
  crossEnvPortability: 80,   // >80%
  domChangeDetection: 95,    // >95%
  falsePositiveRate: 5,      // <5%
  avgResponseTime: 50,       // <50ms average response
  memoryUsage: 100,          // <100MB memory usage
  dbSize: 50                 // <50MB database size
};

class PerformanceBenchmarkRunner {
  constructor() {
    this.results = {
      benchmarks: {},
      regressions: [],
      improvements: [],
      warnings: [],
      targetsMet: 0,
      totalTargets: 0
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
      }
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async benchmarkCacheHitRate() {
    this.log('Benchmarking cache hit rate...');
    
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      import { TieredCache } from '../dist/core/tiered-cache.js';
      
      const cache = new BidirectionalCache();
      const tieredCache = new TieredCache(cache);
      
      const testInputs = [
        'Click submit button',
        'click submit button',
        'press submit button',
        'tap submit button',
        'hit submit button',
        'Click the submit button',
        'Click Submit Button',
        'submit button click',
        'button submit click',
        'submit click'
      ];
      
      let hits = 0;
      let misses = 0;
      const responses = [];
      
      try {
        // First pass - populate cache
        for (const input of testInputs) {
          const startTime = Date.now();
          await tieredCache.set(input, 'http://localhost:3000', 'button[type="submit"]');
          const endTime = Date.now();
          responses.push(endTime - startTime);
        }
        
        // Second pass - test hit rate
        for (const input of testInputs) {
          const startTime = Date.now();
          const result = await tieredCache.get(input, 'http://localhost:3000');
          const endTime = Date.now();
          
          if (result) {
            hits++;
          } else {
            misses++;
          }
          responses.push(endTime - startTime);
        }
        
        // Third pass - test variations (should hit due to normalization)
        const variations = [
          'click submit btn',
          'press the submit',
          'submit form button',
          'click form submit'
        ];
        
        for (const variation of variations) {
          const startTime = Date.now();
          const result = await tieredCache.get(variation, 'http://localhost:3000');
          const endTime = Date.now();
          
          if (result) {
            hits++;
          } else {
            misses++;
          }
          responses.push(endTime - startTime);
        }
        
        const totalRequests = hits + misses;
        const hitRate = (hits / totalRequests) * 100;
        const avgResponseTime = responses.reduce((a, b) => a + b, 0) / responses.length;
        
        console.log(JSON.stringify({
          success: true,
          hitRate: hitRate,
          totalRequests: totalRequests,
          hits: hits,
          misses: misses,
          avgResponseTime: avgResponseTime,
          minResponseTime: Math.min(...responses),
          maxResponseTime: Math.max(...responses)
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-hitrate-bench.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-hitrate-bench.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        this.results.benchmarks.cacheHitRate = data.hitRate;
        this.results.benchmarks.avgResponseTime = data.avgResponseTime;
        
        this.log(`Cache Hit Rate: ${data.hitRate.toFixed(1)}% (Target: >${PERFORMANCE_TARGETS.cacheHitRate}%)`);
        this.log(`Average Response Time: ${data.avgResponseTime.toFixed(2)}ms (Target: <${PERFORMANCE_TARGETS.avgResponseTime}ms)`);
        this.log(`Total Requests: ${data.totalRequests}, Hits: ${data.hits}, Misses: ${data.misses}`);
        
        // Check targets
        this.results.totalTargets += 2;
        if (data.hitRate >= PERFORMANCE_TARGETS.cacheHitRate) {
          this.results.targetsMet++;
          this.log('✅ Cache hit rate target MET');
        } else {
          this.log('❌ Cache hit rate target MISSED', 'warn');
          this.results.warnings.push(`Cache hit rate ${data.hitRate.toFixed(1)}% below target ${PERFORMANCE_TARGETS.cacheHitRate}%`);
        }
        
        if (data.avgResponseTime <= PERFORMANCE_TARGETS.avgResponseTime) {
          this.results.targetsMet++;
          this.log('✅ Response time target MET');
        } else {
          this.log('❌ Response time target MISSED', 'warn');
          this.results.warnings.push(`Response time ${data.avgResponseTime.toFixed(2)}ms above target ${PERFORMANCE_TARGETS.avgResponseTime}ms`);
        }
      } else {
        this.log(`Cache hit rate benchmark failed: ${data.error}`, 'error');
      }
    } catch (error) {
      this.log(`Cache hit rate benchmark error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-hitrate-bench.mjs'));
    }
  }

  async benchmarkTestMatchingAccuracy() {
    this.log('Benchmarking test matching accuracy...');
    
    const testScript = `
      import { ContextAwareSimilarityCalculator } from '../dist/core/context-aware-similarity.js';
      import { SmartNormalizer } from '../dist/core/smart-normalizer.js';
      
      const calculator = new ContextAwareSimilarityCalculator();
      const normalizer = new SmartNormalizer();
      
      // Test cases with expected match results
      const testCases = [
        // Should match (true positives)
        { input1: 'Click login button', input2: 'click login button', shouldMatch: true },
        { input1: 'Submit form', input2: 'submit the form', shouldMatch: true },
        { input1: 'Add new item', input2: 'add new item to list', shouldMatch: true },
        { input1: 'Delete task', input2: 'remove task', shouldMatch: true },
        { input1: 'Save changes', input2: 'save modifications', shouldMatch: true },
        
        // Should not match (true negatives)  
        { input1: 'Click login button', input2: 'click logout button', shouldMatch: false },
        { input1: 'Submit form', input2: 'cancel form', shouldMatch: false },
        { input1: 'Add new item', input2: 'delete item', shouldMatch: false },
        { input1: 'Save changes', input2: 'discard changes', shouldMatch: false },
        { input1: 'Open menu', input2: 'close menu', shouldMatch: false },
        
        // Edge cases
        { input1: 'click', input2: 'click button', shouldMatch: true },
        { input1: 'submit', input2: 'submit data', shouldMatch: true },
        { input1: 'login user', input2: 'logout user', shouldMatch: false },
        { input1: 'first item', input2: 'last item', shouldMatch: false },
        { input1: 'enable feature', input2: 'disable feature', shouldMatch: false }
      ];
      
      let correctPredictions = 0;
      let totalTests = testCases.length;
      let falsePositives = 0;
      let falseNegatives = 0;
      
      try {
        for (const testCase of testCases) {
          const norm1 = normalizer.normalize(testCase.input1);
          const norm2 = normalizer.normalize(testCase.input2);
          
          const similarity = normalizer.calculateJaccardSimilarity(norm1.normalizedTokens, norm2.normalizedTokens);
          const isMatch = similarity > 0.6; // Using 0.6 as threshold
          
          if (isMatch === testCase.shouldMatch) {
            correctPredictions++;
          } else {
            if (isMatch && !testCase.shouldMatch) {
              falsePositives++;
            } else if (!isMatch && testCase.shouldMatch) {
              falseNegatives++;
            }
          }
        }
        
        const accuracy = (correctPredictions / totalTests) * 100;
        const falsePositiveRate = (falsePositives / totalTests) * 100;
        
        console.log(JSON.stringify({
          success: true,
          accuracy: accuracy,
          correctPredictions: correctPredictions,
          totalTests: totalTests,
          falsePositives: falsePositives,
          falseNegatives: falseNegatives,
          falsePositiveRate: falsePositiveRate
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-accuracy-bench.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-accuracy-bench.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        this.results.benchmarks.testMatchingAccuracy = data.accuracy;
        this.results.benchmarks.falsePositiveRate = data.falsePositiveRate;
        
        this.log(`Test Matching Accuracy: ${data.accuracy.toFixed(1)}% (Target: >${PERFORMANCE_TARGETS.testMatchingAccuracy}%)`);
        this.log(`False Positive Rate: ${data.falsePositiveRate.toFixed(1)}% (Target: <${PERFORMANCE_TARGETS.falsePositiveRate}%)`);
        this.log(`Correct: ${data.correctPredictions}/${data.totalTests}, FP: ${data.falsePositives}, FN: ${data.falseNegatives}`);
        
        // Check targets
        this.results.totalTargets += 2;
        if (data.accuracy >= PERFORMANCE_TARGETS.testMatchingAccuracy) {
          this.results.targetsMet++;
          this.log('✅ Test matching accuracy target MET');
        } else {
          this.log('❌ Test matching accuracy target MISSED', 'warn');
          this.results.warnings.push(`Test matching accuracy ${data.accuracy.toFixed(1)}% below target ${PERFORMANCE_TARGETS.testMatchingAccuracy}%`);
        }
        
        if (data.falsePositiveRate <= PERFORMANCE_TARGETS.falsePositiveRate) {
          this.results.targetsMet++;
          this.log('✅ False positive rate target MET');
        } else {
          this.log('❌ False positive rate target MISSED', 'warn');
          this.results.warnings.push(`False positive rate ${data.falsePositiveRate.toFixed(1)}% above target ${PERFORMANCE_TARGETS.falsePositiveRate}%`);
        }
      } else {
        this.log(`Test matching accuracy benchmark failed: ${data.error}`, 'error');
      }
    } catch (error) {
      this.log(`Test matching accuracy benchmark error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-accuracy-bench.mjs'));
    }
  }

  async benchmarkCrossEnvironmentPortability() {
    this.log('Benchmarking cross-environment portability...');
    
    const testScript = `
      import { EnhancedCacheKeyManager } from '../dist/core/enhanced-cache-key.js';
      
      const keyManager = new EnhancedCacheKeyManager();
      
      const environments = [
        'http://localhost:3000',
        'http://localhost:8080', 
        'https://staging.myapp.com',
        'https://myapp.com',
        'https://app.mycompany.com'
      ];
      
      const testScenarios = [
        {
          name: 'Login Flow',
          steps: [
            { action: 'type', target: 'input[name="email"]', value: 'test@example.com' },
            { action: 'type', target: 'input[name="password"]', value: 'password' },
            { action: 'click', target: 'button[type="submit"]' }
          ]
        },
        {
          name: 'Add Item',
          steps: [
            { action: 'type', target: 'input.item-input', value: 'New item' },
            { action: 'click', target: '.add-button' }
          ]
        },
        {
          name: 'Navigation',
          steps: [
            { action: 'click', target: '.menu-toggle' },
            { action: 'click', target: 'a[href="/settings"]' }
          ]
        }
      ];
      
      let totalComparisons = 0;
      let portableComparisons = 0;
      const similarities = [];
      
      try {
        for (const scenario of testScenarios) {
          const keys = [];
          
          // Generate keys for all environments
          for (const env of environments) {
            const key = await keyManager.generateEnhanced(scenario.name, env, scenario.steps);
            keys.push({ env, key });
          }
          
          // Compare all pairs
          for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
              const similarity = await keyManager.calculateSimilarity(keys[i].key, keys[j].key);
              similarities.push(similarity);
              totalComparisons++;
              
              // Consider portable if similarity > 80%
              if (similarity > 0.8) {
                portableComparisons++;
              }
            }
          }
        }
        
        const portabilityRate = (portableComparisons / totalComparisons) * 100;
        const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
        
        console.log(JSON.stringify({
          success: true,
          portabilityRate: portabilityRate,
          avgSimilarity: avgSimilarity,
          portableComparisons: portableComparisons,
          totalComparisons: totalComparisons,
          minSimilarity: Math.min(...similarities),
          maxSimilarity: Math.max(...similarities)
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-portability-bench.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-portability-bench.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        this.results.benchmarks.crossEnvPortability = data.portabilityRate;
        this.results.benchmarks.avgSimilarity = data.avgSimilarity;
        
        this.log(`Cross-Environment Portability: ${data.portabilityRate.toFixed(1)}% (Target: >${PERFORMANCE_TARGETS.crossEnvPortability}%)`);
        this.log(`Average Similarity: ${(data.avgSimilarity * 100).toFixed(1)}%`);
        this.log(`Portable: ${data.portableComparisons}/${data.totalComparisons} comparisons`);
        
        // Check target
        this.results.totalTargets++;
        if (data.portabilityRate >= PERFORMANCE_TARGETS.crossEnvPortability) {
          this.results.targetsMet++;
          this.log('✅ Cross-environment portability target MET');
        } else {
          this.log('❌ Cross-environment portability target MISSED', 'warn');
          this.results.warnings.push(`Cross-env portability ${data.portabilityRate.toFixed(1)}% below target ${PERFORMANCE_TARGETS.crossEnvPortability}%`);
        }
      } else {
        this.log(`Cross-environment portability benchmark failed: ${data.error}`, 'error');
      }
    } catch (error) {
      this.log(`Cross-environment portability benchmark error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-portability-bench.mjs'));
    }
  }

  async benchmarkDOMChangeDetection() {
    this.log('Benchmarking DOM change detection...');
    
    const testScript = `
      import { DOMSignatureManager } from '../dist/utils/dom-signature.js';
      
      const domManager = new DOMSignatureManager();
      
      // Simulate DOM structures
      const baseDOM = {
        title: 'Test Page',
        forms: 1,
        buttons: 5,
        inputs: 3,
        links: 10,
        divs: 20
      };
      
      // Create variations with different types of changes
      const variations = [
        // Minor changes (should detect but with high confidence)
        { ...baseDOM, buttons: 6, change: 'minor' }, // Added one button
        { ...baseDOM, inputs: 4, change: 'minor' },  // Added one input
        { ...baseDOM, links: 12, change: 'minor' },  // Added two links
        
        // Major changes (should detect with lower confidence)
        { ...baseDOM, forms: 2, buttons: 10, change: 'major' }, // Major form change
        { ...baseDOM, divs: 50, change: 'major' },              // Doubled divs
        { ...baseDOM, title: 'Different Page', forms: 0, change: 'major' }, // Different page
        
        // No change (control)
        { ...baseDOM, change: 'none' },
        { ...baseDOM, change: 'none' },
        { ...baseDOM, change: 'none' }
      ];
      
      let detectedChanges = 0;
      let totalComparisons = variations.length;
      let correctDetections = 0;
      
      const mockPage = (dom) => ({
        url: () => 'http://localhost:3000/test',
        evaluate: async () => dom
      });
      
      try {
        // Generate base signature
        const baseSignature = await domManager.generateSignature(mockPage(baseDOM), 'default');
        
        // Test change detection
        for (const variation of variations) {
          const varSignature = await domManager.generateSignature(mockPage(variation), 'default');
          
          // Compare signatures (changes detected if hashes differ significantly)
          const hasChanged = baseSignature.hash !== varSignature.hash;
          const confidenceDiff = Math.abs(baseSignature.confidence - varSignature.confidence);
          
          if (hasChanged || confidenceDiff > 0.1) {
            detectedChanges++;
          }
          
          // Check if detection was correct
          const shouldHaveChanged = variation.change !== 'none';
          if ((hasChanged || confidenceDiff > 0.1) === shouldHaveChanged) {
            correctDetections++;
          }
        }
        
        const detectionRate = (detectedChanges / totalComparisons) * 100;
        const accuracy = (correctDetections / totalComparisons) * 100;
        
        console.log(JSON.stringify({
          success: true,
          detectionRate: detectionRate,
          accuracy: accuracy,
          detectedChanges: detectedChanges,
          totalComparisons: totalComparisons,
          correctDetections: correctDetections
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-domchange-bench.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-domchange-bench.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        this.results.benchmarks.domChangeDetection = data.accuracy;
        
        this.log(`DOM Change Detection Accuracy: ${data.accuracy.toFixed(1)}% (Target: >${PERFORMANCE_TARGETS.domChangeDetection}%)`);
        this.log(`Detection Rate: ${data.detectionRate.toFixed(1)}%`);
        this.log(`Correct: ${data.correctDetections}/${data.totalComparisons} detections`);
        
        // Check target
        this.results.totalTargets++;
        if (data.accuracy >= PERFORMANCE_TARGETS.domChangeDetection) {
          this.results.targetsMet++;
          this.log('✅ DOM change detection target MET');
        } else {
          this.log('❌ DOM change detection target MISSED', 'warn');
          this.results.warnings.push(`DOM change detection ${data.accuracy.toFixed(1)}% below target ${PERFORMANCE_TARGETS.domChangeDetection}%`);
        }
      } else {
        this.log(`DOM change detection benchmark failed: ${data.error}`, 'error');
      }
    } catch (error) {
      this.log(`DOM change detection benchmark error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-domchange-bench.mjs'));
    }
  }

  async benchmarkMemoryAndStorage() {
    this.log('Benchmarking memory and storage usage...');
    
    // Check database size
    const cacheDbPath = join(projectRoot, '.claude-playwright', 'cache', 'bidirectional-cache.db');
    let dbSizeMB = 0;
    
    try {
      if (fs.existsSync(cacheDbPath)) {
        const stats = fs.statSync(cacheDbPath);
        dbSizeMB = stats.size / (1024 * 1024);
      }
    } catch (error) {
      this.log(`Could not check database size: ${error.message}`, 'warn');
    }
    
    // Simulate memory usage test
    const testScript = `
      import { BidirectionalCache } from '../dist/core/bidirectional-cache.js';
      
      const initialMemory = process.memoryUsage();
      
      const cache = new BidirectionalCache();
      
      try {
        // Populate cache with test data
        for (let i = 0; i < 1000; i++) {
          await cache.set(\`test input \${i}\`, \`http://localhost:3000/page\${i % 10}\`, \`selector-\${i}\`, 0.8);
        }
        
        const midMemory = process.memoryUsage();
        const memoryDiff = (midMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);
        
        console.log(JSON.stringify({
          success: true,
          memoryUsageMB: memoryDiff,
          initialHeap: initialMemory.heapUsed / (1024 * 1024),
          currentHeap: midMemory.heapUsed / (1024 * 1024)
        }));
      } catch (error) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      
      cache.close();
    `;
    
    fs.writeFileSync(join(projectRoot, 'temp-memory-bench.mjs'), testScript);
    
    try {
      const result = await this.runCommand('node temp-memory-bench.mjs');
      const data = JSON.parse(result.output.trim());
      
      if (data.success) {
        this.results.benchmarks.memoryUsage = data.memoryUsageMB;
        this.results.benchmarks.dbSize = dbSizeMB;
        
        this.log(`Memory Usage: ${data.memoryUsageMB.toFixed(1)}MB (Target: <${PERFORMANCE_TARGETS.memoryUsage}MB)`);
        this.log(`Database Size: ${dbSizeMB.toFixed(1)}MB (Target: <${PERFORMANCE_TARGETS.dbSize}MB)`);
        
        // Check targets
        this.results.totalTargets += 2;
        if (data.memoryUsageMB <= PERFORMANCE_TARGETS.memoryUsage) {
          this.results.targetsMet++;
          this.log('✅ Memory usage target MET');
        } else {
          this.log('❌ Memory usage target MISSED', 'warn');
          this.results.warnings.push(`Memory usage ${data.memoryUsageMB.toFixed(1)}MB above target ${PERFORMANCE_TARGETS.memoryUsage}MB`);
        }
        
        if (dbSizeMB <= PERFORMANCE_TARGETS.dbSize) {
          this.results.targetsMet++;
          this.log('✅ Database size target MET');
        } else {
          this.log('❌ Database size target MISSED', 'warn');
          this.results.warnings.push(`Database size ${dbSizeMB.toFixed(1)}MB above target ${PERFORMANCE_TARGETS.dbSize}MB`);
        }
      } else {
        this.log(`Memory and storage benchmark failed: ${data.error}`, 'error');
      }
    } catch (error) {
      this.log(`Memory and storage benchmark error: ${error.message}`, 'error');
    } finally {
      fs.unlinkSync(join(projectRoot, 'temp-memory-bench.mjs'));
    }
  }

  generateReport() {
    const targetPercentage = this.results.totalTargets > 0 ? 
      ((this.results.targetsMet / this.results.totalTargets) * 100).toFixed(1) : 0;
    
    console.log('\\n' + '='.repeat(80));
    console.log('Performance Benchmarking Report - Phase 2.4');
    console.log('='.repeat(80));
    console.log(`Targets Met: ${this.results.targetsMet}/${this.results.totalTargets} (${targetPercentage}%)`);
    console.log('');
    
    // Performance metrics
    console.log('Performance Metrics:');
    console.log('-'.repeat(40));
    for (const [metric, value] of Object.entries(this.results.benchmarks)) {
      const target = PERFORMANCE_TARGETS[metric];
      if (target) {
        const unit = metric.includes('Rate') || metric.includes('Accuracy') ? '%' : 
                    metric.includes('Time') ? 'ms' : 
                    metric.includes('Memory') || metric.includes('Size') ? 'MB' : '';
        const comparison = metric.includes('Rate') && !metric.includes('false') ? '>=' : '<=';
        const status = (comparison === '>=' ? value >= target : value <= target) ? '✅' : '❌';
        console.log(`${metric}: ${typeof value === 'number' ? value.toFixed(2) : value}${unit} ${status} (Target: ${comparison}${target}${unit})`);
      } else {
        console.log(`${metric}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
      }
    }
    console.log('');
    
    // GitHub issue #11 specific targets
    console.log('GitHub Issue #11 Target Status:');
    console.log('-'.repeat(40));
    const gh11Targets = [
      { name: 'Cache Hit Rate', current: this.results.benchmarks.cacheHitRate, target: 85, unit: '%' },
      { name: 'Test Matching Accuracy', current: this.results.benchmarks.testMatchingAccuracy, target: 90, unit: '%' },
      { name: 'Cross-env Portability', current: this.results.benchmarks.crossEnvPortability, target: 80, unit: '%' },
      { name: 'DOM Change Detection', current: this.results.benchmarks.domChangeDetection, target: 95, unit: '%' },
      { name: 'False Positive Rate', current: this.results.benchmarks.falsePositiveRate, target: 5, unit: '%', reverse: true }
    ];
    
    let gh11Met = 0;
    for (const target of gh11Targets) {
      if (target.current !== undefined) {
        const met = target.reverse ? target.current <= target.target : target.current >= target.target;
        const status = met ? '✅' : '❌';
        if (met) gh11Met++;
        console.log(`${target.name}: ${target.current.toFixed(1)}${target.unit} ${status} (Target: ${target.reverse ? '≤' : '≥'}${target.target}${target.unit})`);
      } else {
        console.log(`${target.name}: Not tested ⚠️`);
      }
    }
    console.log('');
    
    if (this.results.warnings.length > 0) {
      console.log('Warnings:');
      console.log('-'.repeat(40));
      this.results.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`);
      });
      console.log('');
    }
    
    // Overall assessment
    const overallSuccess = (this.results.targetsMet / this.results.totalTargets) >= 0.8; // 80% of targets met
    const gh11Success = gh11Met >= 4; // At least 4 of 5 GitHub targets met
    
    console.log('Overall Assessment:');
    console.log('-'.repeat(40));
    console.log(`Performance Targets: ${overallSuccess ? '✅ PASSED' : '❌ NEEDS IMPROVEMENT'} (${targetPercentage}%)`);
    console.log(`GitHub Issue #11 Goals: ${gh11Success ? '✅ ACHIEVED' : '❌ PARTIAL'} (${gh11Met}/5)`);
    console.log(`Production Ready: ${overallSuccess && gh11Success ? '✅ YES' : '❌ NO'}`);
    
    return overallSuccess && gh11Success;
  }

  async run() {
    console.log('Starting Performance Benchmarking for Phase 2.4...');
    console.log('Validating GitHub issue #11 performance targets');
    console.log('='.repeat(80));
    
    try {
      await this.benchmarkCacheHitRate();
      await this.benchmarkTestMatchingAccuracy();
      await this.benchmarkCrossEnvironmentPortability();
      await this.benchmarkDOMChangeDetection();
      await this.benchmarkMemoryAndStorage();
      
      return this.generateReport();
      
    } catch (error) {
      this.log(`Performance benchmarking failed: ${error.message}`, 'error');
      return false;
    }
  }
}

// Run the benchmarks
const runner = new PerformanceBenchmarkRunner();
const success = await runner.run();

process.exit(success ? 0 : 1);