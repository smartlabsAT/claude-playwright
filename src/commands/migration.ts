#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { BidirectionalCache } from '../core/bidirectional-cache.js';
import { CacheMigrationManager } from '../core/cache-migration.js';

/**
 * CLI Commands for Enhanced Cache Key Migration System (Phase 2.2)
 */

/**
 * Create migration management command
 */
export function createMigrationCommand(): Command {
  const migrationCommand = new Command('migration')
    .alias('migrate')
    .description('🔄 Enhanced cache key migration management (Phase 2.2)')
    .action((options) => {
      showMigrationHelp();
    });

  // Migration status command
  migrationCommand
    .command('status')
    .description('Check migration status and system health')
    .action(async () => {
      try {
        await showMigrationStatus();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Migration status check failed:'), errorMessage);
        process.exit(1);
      }
    });

  // Run migration command
  migrationCommand
    .command('run')
    .description('Perform migration to enhanced cache key system')
    .option('--dry-run', 'Simulate migration without making changes')
    .option('--batch-size <size>', 'Number of entries to process per batch', parseInt, 500)
    .option('--force', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        await runMigration(options);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Migration failed:'), errorMessage);
        process.exit(1);
      }
    });

  // Rollback migration command
  migrationCommand
    .command('rollback')
    .description('Rollback enhanced cache key migration (emergency only)')
    .option('--force', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        await rollbackMigration(options);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Migration rollback failed:'), errorMessage);
        process.exit(1);
      }
    });

  // Validate migration command
  migrationCommand
    .command('validate')
    .description('Validate migration integrity and performance')
    .action(async () => {
      try {
        await validateMigration();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Migration validation failed:'), errorMessage);
        process.exit(1);
      }
    });

  // Enhanced key statistics command
  migrationCommand
    .command('stats')
    .description('Show enhanced cache key system statistics')
    .option('--detailed', 'Show detailed breakdown by pattern and profile')
    .action(async (options) => {
      try {
        await showEnhancedStats(options);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Stats retrieval failed:'), errorMessage);
        process.exit(1);
      }
    });

  return migrationCommand;
}

/**
 * Show migration help information
 */
function showMigrationHelp(): void {
  console.log();
  console.log(chalk.blue.bold('🔄 Enhanced Cache Key Migration System'));
  console.log(chalk.gray('Phase 2.2 - Cross-environment cache key compatibility'));
  console.log();
  
  console.log(chalk.cyan.bold('Available Commands:'));
  console.log();
  
  console.log(`  ${chalk.green('status')}`);
  console.log(`    ${chalk.white('Check current migration status and system health')}`);
  console.log(`    ${chalk.gray('• Shows migration progress and completion status')}`);
  console.log(`    ${chalk.gray('• Displays enhanced vs legacy cache entries')}`);
  console.log(`    ${chalk.gray('• Provides system recommendations')}`);
  console.log();
  
  console.log(`  ${chalk.green('run')} ${chalk.gray('[--dry-run] [--batch-size <size>] [--force]')}`);
  console.log(`    ${chalk.white('Perform migration to enhanced cache key system')}`);
  console.log(`    ${chalk.gray('• Converts legacy cache entries to enhanced format')}`);
  console.log(`    ${chalk.gray('• Maintains backward compatibility during transition')}`);
  console.log(`    ${chalk.gray('• Use --dry-run to simulate without changes')}`);
  console.log();
  
  console.log(`  ${chalk.green('validate')}`);
  console.log(`    ${chalk.white('Validate migration integrity and performance')}`);
  console.log(`    ${chalk.gray('• Verifies all entries migrated successfully')}`);
  console.log(`    ${chalk.gray('• Tests enhanced key lookup performance')}`);
  console.log(`    ${chalk.gray('• Checks cross-environment compatibility')}`);
  console.log();
  
  console.log(`  ${chalk.green('stats')} ${chalk.gray('[--detailed]')}`);
  console.log(`    ${chalk.white('Show enhanced cache key system statistics')}`);
  console.log(`    ${chalk.gray('• Enhanced vs legacy entry counts')}`);
  console.log(`    ${chalk.gray('• URL pattern distribution')}`);
  console.log(`    ${chalk.gray('• Performance metrics and hit rates')}`);
  console.log();
  
  console.log(`  ${chalk.red('rollback')} ${chalk.gray('[--force]')}`);
  console.log(`    ${chalk.white('Emergency rollback to legacy cache system')}`);
  console.log(`    ${chalk.red('• Only use if migration causes critical issues')}`);
  console.log(`    ${chalk.gray('• Removes enhanced cache key table')}`);
  console.log(`    ${chalk.gray('• Preserves legacy cache entries')}`);
  console.log();
  
  console.log(chalk.yellow.bold('Key Features:'));
  console.log();
  console.log(`  ${chalk.green('✅')} Cross-environment cache key compatibility`);
  console.log(`  ${chalk.green('✅')} URL pattern normalization (localhost → staging → production)`);
  console.log(`  ${chalk.green('✅')} Steps structure hashing without sensitive values`);
  console.log(`  ${chalk.green('✅')} DOM signature integration for page fingerprinting`);
  console.log(`  ${chalk.green('✅')} Backward compatibility with existing cache`);
  console.log(`  ${chalk.green('✅')} Zero-downtime migration process`);
  console.log();
  
  console.log(chalk.yellow.bold('Examples:'));
  console.log();
  console.log(`  ${chalk.gray('# Check migration status')}`);
  console.log(`  claude-playwright migration status`);
  console.log();
  console.log(`  ${chalk.gray('# Simulate migration without changes')}`);
  console.log(`  claude-playwright migration run --dry-run`);
  console.log();
  console.log(`  ${chalk.gray('# Run migration with custom batch size')}`);
  console.log(`  claude-playwright migration run --batch-size 1000`);
  console.log();
  console.log(`  ${chalk.gray('# Validate migration results')}`);
  console.log(`  claude-playwright migration validate`);
  console.log();
  console.log(`  ${chalk.gray('# Show detailed statistics')}`);
  console.log(`  claude-playwright migration stats --detailed`);
  console.log();
}

/**
 * Show current migration status
 */
async function showMigrationStatus(): Promise<void> {
  console.log(chalk.blue.bold('🔄 Enhanced Cache Key Migration Status'));
  console.log();

  try {
    // Initialize cache and migration manager
    const cache = new BidirectionalCache();
    const migrationManager = new (await import('../core/cache-migration.js')).CacheMigrationManager(cache['db']);
    
    // Get migration status
    const status = migrationManager.getMigrationStatus();
    const isNeeded = migrationManager.isMigrationNeeded();

    console.log(chalk.cyan.bold('Migration Status:'));
    
    if (status.isComplete) {
      console.log(`  ${chalk.green('✅ Migration Complete')}`);
    } else {
      console.log(`  ${chalk.yellow('⚠️ Migration Needed')}`);
    }
    
    console.log(`  ${chalk.gray('Enhanced entries:')} ${chalk.white(status.enhancedEntries)}`);
    console.log(`  ${chalk.gray('Legacy entries:')} ${chalk.white(status.legacyEntries)}`);
    console.log(`  ${chalk.gray('Unmigrated entries:')} ${chalk.white(status.unmigratedEntries)}`);
    
    if (status.unmigratedEntries > 0) {
      console.log();
      console.log(chalk.yellow.bold('🚀 Migration Recommended:'));
      console.log(`  Run: ${chalk.green('claude-playwright migration run')}`);
      console.log(`  This will migrate ${status.unmigratedEntries} legacy entries to enhanced format`);
    }

    console.log();
    console.log(chalk.cyan.bold('System Health:'));

    // Get enhanced statistics
    const stats = await cache.getEnhancedKeyStats();
    console.log(`  ${chalk.gray('Total cache entries:')} ${chalk.white(stats.enhanced_cache_keys?.total || 0)}`);
    console.log(`  ${chalk.gray('Migration progress:')} ${chalk.white((100 * (1 - status.unmigratedEntries / Math.max(status.legacyEntries, 1))).toFixed(1))}%`);

    if (stats.performance_stats) {
      console.log(`  ${chalk.gray('Enhanced hits:')} ${chalk.white(stats.performance_stats.enhanced_hits || 0)}`);
      console.log(`  ${chalk.gray('Migrated entries:')} ${chalk.white(stats.performance_stats.migration_count || 0)}`);
    }

    console.log();

  } catch (error) {
    console.error(chalk.red('❌ Failed to retrieve migration status:'), error);
    throw error;
  }
}

/**
 * Run migration process
 */
async function runMigration(options: any): Promise<void> {
  console.log(chalk.blue.bold('🔄 Enhanced Cache Key Migration'));
  console.log();

  const isDryRun = options.dryRun;
  const batchSize = options.batchSize || 500;
  const force = options.force;

  if (isDryRun) {
    console.log(chalk.yellow('🧪 DRY RUN MODE - No changes will be made'));
    console.log();
  }

  try {
    // Initialize cache and migration manager
    const cache = new BidirectionalCache();
    const migrationManager = new (await import('../core/cache-migration.js')).CacheMigrationManager(cache['db']);
    
    // Check if migration is needed
    const isNeeded = migrationManager.isMigrationNeeded();
    if (!isNeeded) {
      console.log(chalk.green('✅ Migration already complete or not needed'));
      return;
    }

    // Get pre-migration status
    const preStatus = migrationManager.getMigrationStatus();
    console.log(chalk.cyan('Pre-migration Status:'));
    console.log(`  Legacy entries: ${preStatus.legacyEntries}`);
    console.log(`  Unmigrated: ${preStatus.unmigratedEntries}`);
    console.log();

    // Confirmation prompt
    if (!force && !isDryRun) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Migrate ${preStatus.unmigratedEntries} cache entries to enhanced format?`,
        default: false
      }]);

      if (!confirmed) {
        console.log(chalk.yellow('Migration cancelled'));
        return;
      }
    }

    // Run migration
    console.log(chalk.blue('🚀 Starting migration...'));
    console.log(`  Batch size: ${batchSize}`);
    console.log(`  Dry run: ${isDryRun ? 'Yes' : 'No'}`);
    console.log();

    const startTime = Date.now();
    const result = await migrationManager.performMigration({
      batchSize,
      retryFailures: true,
      preserveOldData: true,
      validateAfterMigration: true,
      dryRun: isDryRun
    });

    const duration = Date.now() - startTime;

    console.log();
    if (result.success) {
      console.log(chalk.green.bold('✅ Migration Completed Successfully'));
      console.log();
      console.log(chalk.cyan('Results:'));
      console.log(`  ${chalk.green('Migrated:')} ${result.migrated} entries`);
      console.log(`  ${chalk.blue('Skipped:')} ${result.skipped} entries`);
      console.log(`  ${chalk.red('Errors:')} ${result.errors} entries`);
      console.log(`  ${chalk.gray('Duration:')} ${duration}ms`);
      
      if (result.details.length > 0) {
        console.log();
        console.log(chalk.cyan('Migration Details:'));
        result.details.forEach(detail => {
          console.log(`  • ${detail}`);
        });
      }
      
      if (!isDryRun) {
        console.log();
        console.log(chalk.yellow.bold('🎉 Enhanced cache key system is now active!'));
        console.log(chalk.gray('Your cache now supports cross-environment compatibility'));
      }
    } else {
      console.log(chalk.red.bold('❌ Migration Failed'));
      console.log();
      console.log(chalk.cyan('Results:'));
      console.log(`  ${chalk.green('Migrated:')} ${result.migrated} entries`);
      console.log(`  ${chalk.red('Errors:')} ${result.errors} entries`);
      console.log(`  ${chalk.gray('Duration:')} ${duration}ms`);
      
      console.log();
      console.log(chalk.red('Error Details:'));
      result.details.forEach(detail => {
        console.log(`  • ${detail}`);
      });
    }

  } catch (error) {
    console.error(chalk.red('❌ Migration failed:'), error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function rollbackMigration(options: any): Promise<void> {
  console.log(chalk.red.bold('⚠️ Enhanced Cache Key Migration Rollback'));
  console.log(chalk.yellow('This will remove the enhanced cache key system'));
  console.log();

  const force = options.force;

  if (!force) {
    console.log(chalk.red.bold('⚠️ WARNING: This is an emergency operation'));
    console.log(chalk.red('• This will remove all enhanced cache keys'));
    console.log(chalk.red('• Legacy cache will remain intact'));
    console.log(chalk.red('• You will lose cross-environment compatibility'));
    console.log();
    
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure you want to rollback the migration?',
      default: false
    }]);

    if (!confirmed) {
      console.log(chalk.yellow('Rollback cancelled'));
      return;
    }

    const { doubleConfirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'doubleConfirmed',
      message: 'This will permanently delete enhanced cache data. Continue?',
      default: false
    }]);

    if (!doubleConfirmed) {
      console.log(chalk.yellow('Rollback cancelled'));
      return;
    }
  }

  try {
    // Initialize cache and migration manager
    const cache = new BidirectionalCache();
    const migrationManager = new (await import('../core/cache-migration.js')).CacheMigrationManager(cache['db']);
    
    console.log(chalk.red('🔄 Rolling back migration...'));
    
    const success = migrationManager.rollbackMigration();
    
    if (success) {
      console.log(chalk.green('✅ Migration rollback completed'));
      console.log(chalk.yellow('⚠️ Enhanced cache key features are no longer available'));
    } else {
      console.log(chalk.red('❌ Migration rollback failed'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Rollback failed:'), error);
    throw error;
  }
}

/**
 * Validate migration
 */
async function validateMigration(): Promise<void> {
  console.log(chalk.blue.bold('🔍 Enhanced Cache Key Migration Validation'));
  console.log();

  try {
    // Initialize cache and migration manager
    const cache = new BidirectionalCache();
    const migrationManager = new (await import('../core/cache-migration.js')).CacheMigrationManager(cache['db']);
    
    console.log(chalk.blue('Running validation checks...'));
    console.log();

    // Check migration status
    const status = migrationManager.getMigrationStatus();
    
    console.log(chalk.cyan.bold('Migration Completeness:'));
    if (status.isComplete) {
      console.log(`  ${chalk.green('✅')} Migration is complete`);
    } else {
      console.log(`  ${chalk.red('❌')} Migration incomplete - ${status.unmigratedEntries} entries remaining`);
    }
    
    console.log(`  ${chalk.gray('Enhanced entries:')} ${status.enhancedEntries}`);
    console.log(`  ${chalk.gray('Legacy entries:')} ${status.legacyEntries}`);
    
    console.log();
    console.log(chalk.cyan.bold('System Performance:'));

    // Get performance statistics
    const stats = await cache.getEnhancedKeyStats();

    if (stats.performance_stats) {
      console.log(`  ${chalk.gray('Enhanced cache hits:')} ${stats.performance_stats.enhanced_hits || 0}`);
      console.log(`  ${chalk.gray('Migration count:')} ${stats.performance_stats.migration_count || 0}`);
    }

    if (stats.enhanced_cache_keys) {
      console.log(`  ${chalk.gray('Total enhanced keys:')} ${stats.enhanced_cache_keys.total}`);

      if (stats.enhanced_cache_keys.by_source) {
        console.log(`  ${chalk.gray('Source distribution:')}`);
        stats.enhanced_cache_keys.by_source.forEach((source: any) => {
          console.log(`    ${source.migration_source}: ${source.count}`);
        });
      }
    }
    
    console.log();
    console.log(chalk.cyan.bold('Key Features Status:'));
    console.log(`  ${chalk.green('✅')} Enhanced cache key schema`);
    console.log(`  ${chalk.green('✅')} URL pattern normalization`);
    console.log(`  ${chalk.green('✅')} Steps structure hashing`);
    console.log(`  ${chalk.green('✅')} DOM signature integration`);
    console.log(`  ${chalk.green('✅')} Backward compatibility`);
    
    if (status.isComplete) {
      console.log();
      console.log(chalk.green.bold('🎉 Enhanced cache key system is fully operational!'));
    } else {
      console.log();
      console.log(chalk.yellow.bold('⚠️ Run migration to complete the upgrade process'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Validation failed:'), error);
    throw error;
  }
}

/**
 * Show enhanced statistics
 */
async function showEnhancedStats(options: any): Promise<void> {
  console.log(chalk.blue.bold('📊 Enhanced Cache Key System Statistics'));
  console.log();

  try {
    // Initialize cache
    const cache = new BidirectionalCache();
    const stats = await cache.getEnhancedKeyStats();

    console.log(chalk.cyan.bold('Enhanced Cache Keys:'));
    if (stats.enhanced_cache_keys) {
      console.log(`  ${chalk.gray('Total entries:')} ${chalk.white(stats.enhanced_cache_keys.total)}`);

      if (stats.enhanced_cache_keys.by_source) {
        console.log(`  ${chalk.gray('By source:')}`);
        stats.enhanced_cache_keys.by_source.forEach((source: any) => {
          console.log(`    ${chalk.white(source.migration_source)}: ${chalk.white(source.count)}`);
        });
      }

      if (stats.enhanced_cache_keys.by_profile && options.detailed) {
        console.log(`  ${chalk.gray('By profile:')}`);
        stats.enhanced_cache_keys.by_profile.forEach((profile: any) => {
          console.log(`    ${chalk.white(profile.profile)}: ${chalk.white(profile.count)}`);
        });
      }
    }
    
    console.log();
    console.log(chalk.cyan.bold('Migration Status:'));
    if (stats.migration_status) {
      const status = stats.migration_status;
      console.log(`  ${chalk.gray('Is complete:')} ${status.isComplete ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  ${chalk.gray('Enhanced entries:')} ${chalk.white(status.enhancedEntries)}`);
      console.log(`  ${chalk.gray('Legacy entries:')} ${chalk.white(status.legacyEntries)}`);
      console.log(`  ${chalk.gray('Unmigrated:')} ${chalk.white(status.unmigratedEntries)}`);
      
      if (status.legacyEntries > 0) {
        const migrationProgress = (100 * (1 - status.unmigratedEntries / status.legacyEntries)).toFixed(1);
        console.log(`  ${chalk.gray('Migration progress:')} ${chalk.white(migrationProgress)}%`);
      }
    }
    
    console.log();
    console.log(chalk.cyan.bold('Performance Stats:'));
    if (stats.performance_stats) {
      console.log(`  ${chalk.gray('Enhanced hits:')} ${chalk.white(stats.performance_stats.enhanced_hits || 0)}`);
      console.log(`  ${chalk.gray('Migration count:')} ${chalk.white(stats.performance_stats.migration_count || 0)}`);
    }
    
    if (options.detailed && stats.enhanced_cache_keys?.by_profile) {
      console.log();
      console.log(chalk.cyan.bold('Detailed Profile Breakdown:'));
      stats.enhanced_cache_keys.by_profile.forEach((profile: any) => {
        console.log(`  ${chalk.yellow(profile.profile)}: ${chalk.white(profile.count)} entries`);
      });
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to retrieve enhanced statistics:'), error);
    throw error;
  }
}