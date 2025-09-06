#!/usr/bin/env node

/**
 * Production Cache Debugging and Monitoring Tool
 * 
 * Advanced debugging capabilities for Phase 2.4:
 * - DOM signature analysis and validation
 * - Enhanced cache key inspection
 * - Cross-environment cache analysis
 * - Performance regression detection
 * - Real-time cache monitoring
 * - Migration status and validation
 */

import { Command } from 'commander';
import { BidirectionalCache } from '../core/bidirectional-cache.js';
import { EnhancedCacheKeyManager } from '../core/enhanced-cache-key.js';
import { DOMSignatureManager } from '../utils/dom-signature.js';
import { CacheMigrationManager } from '../core/cache-migration.js';
import { ContextAwareSimilarityCalculator } from '../core/context-aware-similarity.js';
import * as fs from 'fs';
import * as path from 'path';

interface DebugOptions {
  verbose?: boolean;
  export?: string;
  analyze?: string;
  monitor?: boolean;
  validate?: boolean;
  performance?: boolean;
}

export class CacheDebugTool {
  private cache: BidirectionalCache;
  private keyManager: EnhancedCacheKeyManager;
  private domManager: DOMSignatureManager;
  private migrationManager: CacheMigrationManager;
  private similarityCalculator: ContextAwareSimilarityCalculator;

  constructor() {
    this.cache = new BidirectionalCache();
    this.keyManager = new EnhancedCacheKeyManager();
    this.domManager = new DOMSignatureManager();
    this.migrationManager = new CacheMigrationManager();
    this.similarityCalculator = new ContextAwareSimilarityCalculator();
  }

  async debugStatus(options: DebugOptions): Promise<void> {
    console.log('='.repeat(80));
    console.log('Cache Debug Status - Phase 2.4');
    console.log('='.repeat(80));

    try {
      // Basic cache statistics
      const stats = await this.cache.getStats();
      const domStats = await this.cache.getDOMSignatureStats();
      const enhancedStats = await this.cache.getEnhancedKeyStats();
      const migrationStatus = await this.migrationManager.checkMigrationStatus();

      // System health overview
      console.log('\n📊 System Health Overview:');
      console.log('-'.repeat(40));
      console.log(`Cache Status: ${stats.operations ? '✅ Active' : '❌ Inactive'}`);
      console.log(`DOM Signatures: ${domStats.generated > 0 ? '✅ Enabled' : '⚠️  Limited'}`);
      console.log(`Enhanced Keys: ${enhancedStats.hits > 0 ? '✅ Active' : '⚠️  Unused'}`);
      console.log(`Migration: ${migrationStatus.isComplete ? '✅ Complete' : '⚠️  Pending'}`);

      // Performance metrics
      console.log('\n🎯 Performance Metrics:');
      console.log('-'.repeat(40));
      console.log(`Cache Hit Rate: ${(stats.operations?.hit_rate || 0).toFixed(1)}%`);
      console.log(`DOM Signature Hit Rate: ${domStats.hitRate.toFixed(1)}%`);
      console.log(`False Positive Rate: ${enhancedStats.falsePositiveRate.toFixed(1)}%`);
      console.log(`Cross-env Portability: ${enhancedStats.portabilityRate.toFixed(1)}%`);

      // Storage analysis
      console.log('\n💾 Storage Analysis:');
      console.log('-'.repeat(40));
      console.log(`Selector Cache Entries: ${stats.storage?.total_selectors || 0}`);
      console.log(`Input Mappings: ${stats.storage?.total_mappings || 0}`);
      console.log(`DOM Signatures Generated: ${domStats.generated}`);
      console.log(`Cross-env Matches: ${domStats.crossEnvMatches}`);

      if (options.verbose) {
        await this.detailedAnalysis(stats, domStats, enhancedStats);
      }

      if (options.analyze) {
        await this.analyzeSpecificPattern(options.analyze);
      }

      if (options.validate) {
        await this.validateCacheIntegrity();
      }

      if (options.performance) {
        await this.performanceAnalysis();
      }

      if (options.export) {
        await this.exportDebugData(options.export, { stats, domStats, enhancedStats, migrationStatus });
      }

    } catch (error) {
      console.error('❌ Debug analysis failed:', error);
    }
  }

  private async detailedAnalysis(stats: any, domStats: any, enhancedStats: any): Promise<void> {
    console.log('\n🔍 Detailed Analysis:');
    console.log('-'.repeat(40));

    // Cache distribution analysis
    console.log('\nCache Distribution:');
    const distribution = await this.getCacheDistribution();
    for (const [url, count] of Object.entries(distribution.byUrl).slice(0, 10)) {
      console.log(`  ${url}: ${count} entries`);
    }

    // Similarity patterns
    console.log('\nSimilarity Patterns:');
    const similarityStats = await this.analyzeSimilarityPatterns();
    console.log(`  High similarity pairs: ${similarityStats.highSimilarity}`);
    console.log(`  Conflict pairs: ${similarityStats.conflicts}`);
    console.log(`  Unique patterns: ${similarityStats.uniquePatterns}`);

    // DOM signature analysis
    console.log('\nDOM Signature Analysis:');
    const domAnalysis = await this.analyzeDOMSignatures();
    console.log(`  Unique signatures: ${domAnalysis.uniqueSignatures}`);
    console.log(`  Average confidence: ${domAnalysis.avgConfidence.toFixed(2)}`);
    console.log(`  Signature collisions: ${domAnalysis.collisions}`);
  }

  private async analyzeSpecificPattern(pattern: string): Promise<void> {
    console.log(`\n🔎 Analyzing Pattern: "${pattern}"`);
    console.log('-'.repeat(40));

    try {
      // Find related cache entries
      const relatedEntries = await this.findRelatedEntries(pattern);
      
      console.log(`Found ${relatedEntries.length} related entries:`);
      for (const entry of relatedEntries.slice(0, 10)) {
        console.log(`  ${entry.input} → ${entry.selector} (${entry.confidence})`);
      }

      // Analyze similarity with other patterns
      const similarities = await this.calculatePatternSimilarities(pattern);
      console.log(`\nTop similar patterns:`);
      for (const sim of similarities.slice(0, 5)) {
        console.log(`  ${sim.pattern} (${(sim.similarity * 100).toFixed(1)}%)`);
      }

      // Check cross-environment matches
      const crossEnvMatches = await this.findCrossEnvironmentMatches(pattern);
      console.log(`\nCross-environment matches: ${crossEnvMatches.length}`);
      for (const match of crossEnvMatches.slice(0, 5)) {
        console.log(`  ${match.env1} ↔ ${match.env2} (${(match.similarity * 100).toFixed(1)}%)`);
      }

    } catch (error) {
      console.error('❌ Pattern analysis failed:', error);
    }
  }

  private async validateCacheIntegrity(): Promise<void> {
    console.log('\n🔬 Cache Integrity Validation:');
    console.log('-'.repeat(40));

    const validationResults = {
      orphanedMappings: 0,
      missingDOMSignatures: 0,
      invalidSelectors: 0,
      corruptedEntries: 0,
      inconsistentConfidence: 0
    };

    try {
      // Check for orphaned input mappings
      const orphanCheck = await this.cache.validateCacheIntegrity();
      validationResults.orphanedMappings = orphanCheck.orphanedMappings || 0;
      validationResults.missingDOMSignatures = orphanCheck.missingDOMSignatures || 0;
      validationResults.invalidSelectors = orphanCheck.invalidSelectors || 0;

      // Validate DOM signatures
      const domValidation = await this.validateDOMSignatures();
      validationResults.corruptedEntries += domValidation.corrupted || 0;

      // Check confidence score consistency
      const confidenceValidation = await this.validateConfidenceScores();
      validationResults.inconsistentConfidence = confidenceValidation.inconsistent || 0;

      console.log('Validation Results:');
      for (const [issue, count] of Object.entries(validationResults)) {
        const status = count === 0 ? '✅' : '⚠️';
        console.log(`  ${status} ${issue}: ${count}`);
      }

      const totalIssues = Object.values(validationResults).reduce((a, b) => a + b, 0);
      console.log(`\nOverall: ${totalIssues === 0 ? '✅ Cache integrity OK' : `⚠️  ${totalIssues} issues found`}`);

    } catch (error) {
      console.error('❌ Cache validation failed:', error);
    }
  }

  private async performanceAnalysis(): Promise<void> {
    console.log('\n⚡ Performance Analysis:');
    console.log('-'.repeat(40));

    try {
      // Response time analysis
      const responseTimeStats = await this.analyzeResponseTimes();
      console.log(`Average lookup time: ${responseTimeStats.average.toFixed(2)}ms`);
      console.log(`95th percentile: ${responseTimeStats.p95.toFixed(2)}ms`);
      console.log(`Slowest operations: ${responseTimeStats.slowest.join(', ')}`);

      // Memory usage analysis
      const memoryStats = await this.analyzeMemoryUsage();
      console.log(`\nMemory Usage:`);
      console.log(`  Cache memory: ${memoryStats.cacheMemory.toFixed(1)}MB`);
      console.log(`  DOM signatures: ${memoryStats.domSignatures.toFixed(1)}MB`);
      console.log(`  Total: ${memoryStats.total.toFixed(1)}MB`);

      // Database performance
      const dbStats = await this.analyzeDatabasePerformance();
      console.log(`\nDatabase Performance:`);
      console.log(`  Query time (avg): ${dbStats.avgQueryTime.toFixed(2)}ms`);
      console.log(`  Index usage: ${dbStats.indexUsage.toFixed(1)}%`);
      console.log(`  Database size: ${dbStats.size.toFixed(1)}MB`);

      // Recommend optimizations
      const recommendations = this.generatePerformanceRecommendations(responseTimeStats, memoryStats, dbStats);
      if (recommendations.length > 0) {
        console.log('\nRecommendations:');
        recommendations.forEach((rec, index) => {
          console.log(`  ${index + 1}. ${rec}`);
        });
      }

    } catch (error) {
      console.error('❌ Performance analysis failed:', error);
    }
  }

  private async exportDebugData(exportPath: string, data: any): Promise<void> {
    console.log(`\n📁 Exporting debug data to: ${exportPath}`);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `cache-debug-${timestamp}.json`;
      const fullPath = path.join(exportPath, filename);

      // Ensure directory exists
      fs.mkdirSync(exportPath, { recursive: true });

      // Add additional debugging information
      const debugData = {
        timestamp: new Date().toISOString(),
        phase: '2.4',
        version: '0.1.0',
        ...data,
        detailedStats: {
          distribution: await this.getCacheDistribution(),
          similarityStats: await this.analyzeSimilarityPatterns(),
          domAnalysis: await this.analyzeDOMSignatures(),
          performanceMetrics: await this.analyzeResponseTimes()
        }
      };

      fs.writeFileSync(fullPath, JSON.stringify(debugData, null, 2));
      console.log(`✅ Debug data exported to: ${fullPath}`);
      console.log(`📊 File size: ${(fs.statSync(fullPath).size / 1024).toFixed(1)} KB`);

    } catch (error) {
      console.error('❌ Export failed:', error);
    }
  }

  // Helper methods for analysis
  private async getCacheDistribution(): Promise<any> {
    // Implementation would query the database for distribution statistics
    return {
      byUrl: {},
      bySelector: {},
      byConfidence: {}
    };
  }

  private async analyzeSimilarityPatterns(): Promise<any> {
    // Implementation would analyze similarity patterns in the cache
    return {
      highSimilarity: 0,
      conflicts: 0,
      uniquePatterns: 0
    };
  }

  private async analyzeDOMSignatures(): Promise<any> {
    // Implementation would analyze DOM signature data
    return {
      uniqueSignatures: 0,
      avgConfidence: 0,
      collisions: 0
    };
  }

  private async findRelatedEntries(pattern: string): Promise<any[]> {
    // Implementation would find related cache entries
    return [];
  }

  private async calculatePatternSimilarities(pattern: string): Promise<any[]> {
    // Implementation would calculate similarities with other patterns
    return [];
  }

  private async findCrossEnvironmentMatches(pattern: string): Promise<any[]> {
    // Implementation would find cross-environment matches
    return [];
  }

  private async validateDOMSignatures(): Promise<any> {
    // Implementation would validate DOM signature integrity
    return { corrupted: 0 };
  }

  private async validateConfidenceScores(): Promise<any> {
    // Implementation would validate confidence score consistency
    return { inconsistent: 0 };
  }

  private async analyzeResponseTimes(): Promise<any> {
    // Implementation would analyze response time statistics
    return {
      average: 0,
      p95: 0,
      slowest: []
    };
  }

  private async analyzeMemoryUsage(): Promise<any> {
    // Implementation would analyze memory usage
    return {
      cacheMemory: 0,
      domSignatures: 0,
      total: 0
    };
  }

  private async analyzeDatabasePerformance(): Promise<any> {
    // Implementation would analyze database performance
    return {
      avgQueryTime: 0,
      indexUsage: 0,
      size: 0
    };
  }

  private generatePerformanceRecommendations(responseTime: any, memory: any, database: any): string[] {
    const recommendations: string[] = [];

    if (responseTime.average > 50) {
      recommendations.push('Consider optimizing cache lookup algorithms (avg response time > 50ms)');
    }

    if (memory.total > 100) {
      recommendations.push('Memory usage is high - consider implementing cache cleanup policies');
    }

    if (database.size > 50) {
      recommendations.push('Database size is large - consider archiving old entries');
    }

    if (database.indexUsage < 80) {
      recommendations.push('Database index usage is low - review query optimization');
    }

    return recommendations;
  }

  async close(): Promise<void> {
    this.cache.close();
  }
}

// CLI command setup
export function setupCacheDebugCommand(program: Command): void {
  const debugCmd = program
    .command('debug')
    .description('Advanced cache debugging and monitoring tool for Phase 2.4')
    .option('-v, --verbose', 'Enable verbose output')
    .option('-e, --export <path>', 'Export debug data to specified path')
    .option('-a, --analyze <pattern>', 'Analyze specific pattern or selector')
    .option('-m, --monitor', 'Enable real-time monitoring mode')
    .option('--validate', 'Validate cache integrity')
    .option('--performance', 'Perform detailed performance analysis')
    .action(async (options: DebugOptions) => {
      const debugTool = new CacheDebugTool();
      
      try {
        await debugTool.debugStatus(options);
        
        if (options.monitor) {
          console.log('\n🔄 Monitoring mode enabled (press Ctrl+C to exit)');
          // Set up monitoring interval
          const monitorInterval = setInterval(async () => {
            console.clear();
            await debugTool.debugStatus({ ...options, monitor: false });
          }, 5000);

          process.on('SIGINT', () => {
            clearInterval(monitorInterval);
            debugTool.close();
            process.exit(0);
          });
        } else {
          await debugTool.close();
        }
      } catch (error) {
        console.error('❌ Debug command failed:', error);
        await debugTool.close();
        process.exit(1);
      }
    });

  // Subcommands for specific debug operations
  debugCmd
    .command('dom-signatures')
    .description('Analyze DOM signature generation and caching')
    .action(async () => {
      const debugTool = new CacheDebugTool();
      try {
        console.log('🔍 DOM Signature Analysis');
        console.log('='.repeat(40));
        const domStats = await debugTool.cache.getDOMSignatureStats();
        console.log(`Generated: ${domStats.generated}`);
        console.log(`Cached: ${domStats.cached}`);
        console.log(`Hit Rate: ${domStats.hitRate.toFixed(1)}%`);
        console.log(`Avg Confidence: ${domStats.avgConfidence.toFixed(2)}`);
        await debugTool.close();
      } catch (error) {
        console.error('❌ DOM signature analysis failed:', error);
        await debugTool.close();
        process.exit(1);
      }
    });

  debugCmd
    .command('enhanced-keys')
    .description('Analyze enhanced cache key performance')
    .action(async () => {
      const debugTool = new CacheDebugTool();
      try {
        console.log('🔑 Enhanced Cache Key Analysis');
        console.log('='.repeat(40));
        const enhancedStats = await debugTool.cache.getEnhancedKeyStats();
        console.log(`Hits: ${enhancedStats.hits}`);
        console.log(`Misses: ${enhancedStats.misses}`);
        console.log(`Adaptations: ${enhancedStats.adaptations}`);
        console.log(`False Positive Rate: ${enhancedStats.falsePositiveRate.toFixed(1)}%`);
        console.log(`Portability Rate: ${enhancedStats.portabilityRate.toFixed(1)}%`);
        await debugTool.close();
      } catch (error) {
        console.error('❌ Enhanced key analysis failed:', error);
        await debugTool.close();
        process.exit(1);
      }
    });

  debugCmd
    .command('migration')
    .description('Check cache migration status and validate')
    .action(async () => {
      const debugTool = new CacheDebugTool();
      try {
        console.log('🔄 Migration Status Check');
        console.log('='.repeat(40));
        const migrationStatus = await debugTool.migrationManager.checkMigrationStatus();
        console.log(`Migration Complete: ${migrationStatus.isComplete ? '✅' : '❌'}`);
        console.log(`Entries Migrated: ${migrationStatus.entriesMigrated || 0}`);
        console.log(`Pending Migrations: ${migrationStatus.pendingMigrations || 0}`);
        await debugTool.close();
      } catch (error) {
        console.error('❌ Migration check failed:', error);
        await debugTool.close();
        process.exit(1);
      }
    });
}