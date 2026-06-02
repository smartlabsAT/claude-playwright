#!/usr/bin/env node

import chalk from 'chalk';
import path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';
import fs from 'fs-extra';
import { EnhancedCacheIntegration } from '../core/bidirectional-cache';

/**
 * Show comprehensive cache information and statistics
 */
export async function showCacheInfo(): Promise<void> {
  console.log(chalk.blue('🔍 Cache System Information'));
  console.log('');

  try {
    const enhancedCache = EnhancedCacheIntegration.getInstance();
    
    // Get cache directory info
    const cacheDir = ProjectPaths.getCacheDir();
    console.log(chalk.cyan('📁 Cache Directory:'), chalk.white(cacheDir));
    
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      console.log(chalk.cyan('📂 Cache Files:'), chalk.white(files.join(', ')));
      
      // Check file sizes
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`   ${chalk.gray('├')} ${file}: ${chalk.green(sizeKB + ' KB')}`);
      }
    } else {
      console.log(chalk.yellow('⚠️  Cache directory does not exist yet'));
    }
    
    console.log('');
    
    // Get cache statistics
    const metrics = await enhancedCache.getMetrics();
    
    console.log(chalk.blue('📊 Cache Performance:'));
    console.log('');
    
    if (metrics.tiered) {
      console.log(chalk.cyan('Memory Cache:'));
      console.log(`   Hit Rate: ${chalk.green(metrics.tiered.memoryHitRate + '%')}`);
      console.log(`   Current Size: ${chalk.white(metrics.tiered.memorySize)}/${chalk.white(metrics.tiered.memoryMax)} entries`);
      console.log('');
      
      console.log(chalk.cyan('SQLite Cache:'));
      console.log(`   Hit Rate: ${chalk.green(metrics.tiered.sqliteHitRate + '%')}`);
      console.log('');
      
      console.log(chalk.cyan('Overall Performance:'));
      console.log(`   Combined Hit Rate: ${chalk.green(metrics.tiered.overallHitRate + '%')}`);
      console.log(`   Total Requests: ${chalk.white(metrics.tiered.totalRequests)}`);
    }
    
    if (metrics.breakdown) {
      console.log('');
      console.log(chalk.cyan('Request Breakdown:'));
      console.log(`   Memory Hits: ${chalk.green(metrics.breakdown.memoryHits)}`);
      console.log(`   SQLite Hits: ${chalk.blue(metrics.breakdown.sqliteHits)}`);
      console.log(`   Misses: ${chalk.red(metrics.breakdown.misses)}`);
    }
    
    // Bidirectional cache stats
    const biStats = await enhancedCache.getBidirectionalStats();
    if (biStats.storage) {
      console.log('');
      console.log(chalk.blue('🧠 Bidirectional Cache:'));
      console.log(`   Unique Selectors: ${chalk.green(biStats.storage.unique_selectors)}`);
      console.log(`   Total Mappings: ${chalk.blue(biStats.storage.total_mappings)}`);
      console.log(`   Avg Success Count: ${chalk.white(biStats.storage.avg_success_count?.toFixed(1))}`);
      console.log(`   Learning Rate: ${chalk.yellow(biStats.storage.learning_rate?.toFixed(1) + '%')}`);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get cache info:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Clear all cache data
 */
export async function clearCache(options: { force?: boolean } = {}): Promise<void> {
  console.log(chalk.blue('🗑️  Cache Cleanup'));
  console.log('');

  if (!options.force) {
    console.log(chalk.yellow('⚠️  This will delete all cached selectors and performance data'));
    console.log(chalk.gray('   Use --force to skip this confirmation'));
    console.log('');
    
    // Simple confirmation without external dependencies
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('Are you sure you want to clear all cache data? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(chalk.gray('Cache clearing cancelled'));
      return;
    }
  }

  try {
    const enhancedCache = EnhancedCacheIntegration.getInstance();
    await enhancedCache.clearAll();
    
    console.log(chalk.green('✅ Cache cleared successfully'));
    console.log('');
    console.log(chalk.gray('All cached selectors and performance data have been removed'));
    console.log(chalk.gray('The cache will rebuild automatically as you use Claude Code'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to clear cache:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Show cache health and debug information
 */
export async function showCacheHealth(): Promise<void> {
  console.log(chalk.blue('🏥 Cache Health Check'));
  console.log('');

  try {
    const enhancedCache = EnhancedCacheIntegration.getInstance();
    
    // Health check
    const health = await enhancedCache.healthCheck();
    
    console.log(chalk.cyan('System Status:'));
    console.log(`   Cache Integration: ${health.integration ? chalk.green('✅ Active') : chalk.red('❌ Inactive')}`);
    console.log(`   Memory Cache: ${health.memoryCache ? chalk.green('✅ Working') : chalk.red('❌ Error')}`);
    console.log(`   SQLite Cache: ${health.sqliteCache ? chalk.green('✅ Working') : chalk.red('❌ Error')}`);
    console.log(`   Bidirectional Cache: ${health.bidirectionalCache ? chalk.green('✅ Working') : chalk.red('❌ Error')}`);
    console.log('');
    
    if (health.errors && health.errors.length > 0) {
      console.log(chalk.red('⚠️  Issues Found:'));
      health.errors.forEach((error: string) => {
        console.log(`   ${chalk.red('•')} ${error}`);
      });
      console.log('');
    }
    
    // Performance recommendations
    const metrics = await enhancedCache.getMetrics();
    
    console.log(chalk.blue('📈 Performance Analysis:'));
    
    if (metrics.tiered?.overallHitRate) {
      const hitRate = metrics.tiered.overallHitRate;
      if (hitRate > 80) {
        console.log(`   ${chalk.green('✅')} Excellent hit rate (${hitRate}%)`);
      } else if (hitRate > 60) {
        console.log(`   ${chalk.yellow('⚠️ ')} Good hit rate (${hitRate}%) - room for improvement`);
      } else if (hitRate > 40) {
        console.log(`   ${chalk.yellow('⚠️ ')} Moderate hit rate (${hitRate}%) - consider cache tuning`);
      } else {
        console.log(`   ${chalk.red('❌')} Low hit rate (${hitRate}%) - cache may need rebuilding`);
      }
    }
    
    if (metrics.tiered?.memorySize && metrics.tiered?.memoryMax) {
      const usage = (metrics.tiered.memorySize / metrics.tiered.memoryMax) * 100;
      if (usage > 90) {
        console.log(`   ${chalk.yellow('⚠️ ')} Memory cache nearly full (${usage.toFixed(1)}%)`);
      } else {
        console.log(`   ${chalk.green('✅')} Memory usage healthy (${usage.toFixed(1)}%)`);
      }
    }
    
    console.log('');
    console.log(chalk.gray('💡 Tip: Run "claude-playwright cache clear" if you experience reliability issues'));
    
  } catch (error) {
    console.error(chalk.red('❌ Health check failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Debug recent cache operations
 */
export async function debugCache(): Promise<void> {
  console.log(chalk.blue('🐛 Cache Debug Information'));
  console.log('');
  
  // This would show recent cache operations, failed selectors, etc.
  console.log(chalk.yellow('🚧 Debug information will be enhanced in future versions'));
  console.log('');
  console.log(chalk.gray('For now, check stderr output during Claude Code usage for detailed cache logging:'));
  console.log(chalk.gray('   [TieredCache] Cache HIT/MISS messages'));
  console.log(chalk.gray('   [BidirectionalCache] Similarity calculations'));  
  console.log(chalk.gray('   [TieredCache] VALIDATED/FAILED selector messages'));
  console.log('');
  
  try {
    await showCacheInfo();
  } catch (error) {
    console.error(chalk.red('❌ Debug failed:'), error instanceof Error ? error.message : String(error));
  }
}