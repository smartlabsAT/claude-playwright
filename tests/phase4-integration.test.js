#!/usr/bin/env node

/**
 * Phase 4: Integration Test
 * 
 * Tests the complete Phase 4 validation system integration
 * Verifies all components work together correctly
 */

const path = require('path');

// Test Phase 4 components integration
async function testPhase4Integration() {
  console.log('🧪 Starting Phase 4 Integration Test...\n');
  
  let testsTotal = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  
  const testResults = [];
  
  function logTest(name, success, details) {
    testsTotal++;
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} ${name}`);
    if (details && !success) {
      console.log(`       ${details}`);
    }
    if (success) testsPassed++; else testsFailed++;
    testResults.push({ name, success, details });
  }

  // Test 1: Performance Monitor
  console.log('📊 Testing Performance Monitor...');
  try {
    // Import from CommonJS built files
    const { PerformanceBenchmark } = require('../dist/index.cjs');
    
    const perfMonitor = new PerformanceBenchmark(false); // Not in debug mode for cleaner output
    
    // Test basic instantiation
    logTest('Performance Monitor instantiation', true);
    
    // Test targets configuration
    const targets = perfMonitor.getTargets();
    const hasValidTargets = targets.tool_calling_consistency === 0.90 && 
                           targets.cache_hit_rate === 0.85 && 
                           targets.error_recovery_time === 30000;
    logTest('Performance targets configuration', hasValidTargets, 'Invalid target configuration');
    
    // Test report generation (quick mock)
    const mockResult = {
      timestamp: new Date().toISOString(),
      version: '0.1.0-test',
      tool_consistency: { consistency_rate: 0.92, meets_target: true, details: { total_requests: 10, mcp_tool_usage: 9, builtin_tool_usage: 1 } },
      cache_performance: { hit_rate: 0.87, accuracy: 0.93, average_response_time: 45, meets_targets: { hit_rate: true, accuracy: true } },
      error_recovery: { average_recovery_time: 15000, success_rate: 0.96, meets_targets: true, error_breakdown: {}, recovery_strategies_used: {} },
      cross_environment: { adaptation_success_rate: 0.82, environments_tested: ['localhost', 'staging'], successful_adaptations: 2, failed_adaptations: 0, meets_targets: true },
      overall_success: true
    };
    
    const report = await perfMonitor.generateReport(mockResult);
    logTest('Performance report generation', typeof report === 'string' && report.length > 0, 'Failed to generate report');
    
  } catch (error) {
    logTest('Performance Monitor basic functionality', false, error.message);
  }

  // Test 2: Feature Flag Manager
  console.log('\n🚩 Testing Feature Flag Manager...');
  try {
    const { FeatureFlagManager } = require('../dist/index.cjs');
    
    const flagManager = new FeatureFlagManager();
    
    // Test instantiation and default config
    logTest('Feature Flag Manager instantiation', true);
    
    // Test feature flag checking
    const isEnabled = flagManager.isEnabled('mcp_naming_v2');
    logTest('Feature flag checking', typeof isEnabled === 'boolean', 'Invalid response type for feature check');
    
    // Test config update
    flagManager.updateConfig('enhanced_caching', { rollout_percentage: 50 });
    const config = flagManager.getConfig('enhanced_caching');
    logTest('Feature flag configuration update', config.rollout_percentage === 50, 'Config update failed');
    
    // Test metrics report
    const metricsReport = flagManager.getMetricsReport();
    logTest('Metrics report generation', typeof metricsReport === 'object', 'Invalid metrics report format');
    
    // Test configuration export/import
    const exportedConfig = flagManager.exportConfig();
    logTest('Configuration export', typeof exportedConfig === 'string' && exportedConfig.length > 0, 'Export failed');
    
  } catch (error) {
    logTest('Feature Flag Manager basic functionality', false, error.message);
  }

  // Test 3: Test Orchestrator
  console.log('\n🎭 Testing Test Orchestrator...');
  try {
    const { TestOrchestrator } = require('../dist/index.cjs');
    
    const orchestrator = new TestOrchestrator(false); // Not in debug mode
    
    // Test instantiation
    logTest('Test Orchestrator instantiation', true);
    
    // Test quick validation (should complete quickly with mocked components)
    const quickResult = await orchestrator.quickValidation();
    logTest('Quick validation execution', 
           typeof quickResult.success === 'boolean' && typeof quickResult.summary === 'string',
           'Invalid quick validation response');
    
  } catch (error) {
    logTest('Test Orchestrator basic functionality', false, error.message);
  }

  // Test 4: Validation Reporter
  console.log('\n📄 Testing Validation Reporter...');
  try {
    const { ValidationReporter } = require('../dist/index.cjs');
    
    const reporter = new ValidationReporter();
    
    // Test instantiation
    logTest('Validation Reporter instantiation', true);
    
    // Test configuration
    const config = reporter.getConfig();
    logTest('Reporter configuration access', config.output_format === 'console', 'Invalid default configuration');
    
    // Test report generation with mock data
    const mockValidationReport = {
      timestamp: new Date().toISOString(),
      version: '0.1.0-test',
      overall_success: true,
      results: {
        unit_tests: {
          suite_name: 'Unit Tests',
          total_tests: 25,
          passed: 24,
          failed: 1,
          skipped: 0,
          duration_ms: 1200,
          success_rate: 0.96,
          error_details: ['DOM signature test minor failure'],
          coverage_percentage: 95
        },
        integration_tests: {
          suite_name: 'Integration Tests',
          total_tests: 12,
          passed: 12,
          failed: 0,
          skipped: 0,
          duration_ms: 800,
          success_rate: 1.0,
          error_details: []
        },
        performance_benchmarks: {
          timestamp: new Date().toISOString(),
          version: '0.1.0-test',
          tool_consistency: { consistency_rate: 0.92, meets_target: true, details: { total_requests: 10, mcp_tool_usage: 9, builtin_tool_usage: 1 } },
          cache_performance: { hit_rate: 0.87, accuracy: 0.93, average_response_time: 45, meets_targets: { hit_rate: true, accuracy: true } },
          error_recovery: { average_recovery_time: 15000, success_rate: 0.96, meets_targets: true, error_breakdown: {}, recovery_strategies_used: {} },
          cross_environment: { adaptation_success_rate: 0.82, environments_tested: ['localhost'], successful_adaptations: 1, failed_adaptations: 0, meets_targets: true },
          overall_success: true
        },
        e2e_scenarios: {
          tool_selection_consistency: { success_rate: 0.94, mcp_tool_usage_rate: 0.92, meets_target: true },
          cross_environment_portability: { adaptation_success_rate: 0.82, environments_tested: 4, meets_target: true },
          error_recovery: { average_recovery_time: 15000, success_rate: 0.96, meets_target: true },
          user_experience_validation: { response_time_percentile_95: 1200, error_message_clarity: 0.91, meets_target: true }
        },
        feature_flag_validation: {
          total_flags: 5,
          enabled_flags: 5,
          rollout_health: {},
          ab_tests_active: 1,
          rollback_events: 0
        }
      },
      recommendations: [
        'Unit test coverage excellent at 95%',
        'Consider monitoring error recovery time trends'
      ],
      next_steps: [
        'Continue with regular validation runs',
        'Monitor feature flag rollout health'
      ],
      detailed_logs: []
    };
    
    // Test different report formats
    const consoleReport = await reporter.generateReport(mockValidationReport, 'console');
    logTest('Console report generation', consoleReport.includes('MCP VALIDATION REPORT'), 'Invalid console report format');
    
    const markdownReport = await reporter.generateReport(mockValidationReport, 'markdown');
    logTest('Markdown report generation', markdownReport.includes('# 📊 MCP Validation Report'), 'Invalid markdown report format');
    
    const jsonReport = await reporter.generateReport(mockValidationReport, 'json');
    logTest('JSON report generation', jsonReport.startsWith('{'), 'Invalid JSON report format');
    
    const htmlReport = await reporter.generateReport(mockValidationReport, 'html');
    logTest('HTML report generation', htmlReport.includes('<!DOCTYPE html>'), 'Invalid HTML report format');
    
  } catch (error) {
    logTest('Validation Reporter basic functionality', false, error.message);
  }

  // Test 5: Component Integration
  console.log('\n🔗 Testing Component Integration...');
  try {
    // Test that components can be imported together
    const { PerformanceBenchmark, FeatureFlagManager, TestOrchestrator, ValidationReporter } = require('../dist/index.cjs');
    
    const components = [
      new PerformanceBenchmark(false),
      new FeatureFlagManager(),
      new TestOrchestrator(false),
      new ValidationReporter()
    ];
    
    logTest('All components can be instantiated together', components.length === 4, 'Component instantiation failed');
    
    // Test basic interaction between orchestrator and reporter
    const orchestrator = new TestOrchestrator(false);
    const reporter = new ValidationReporter();
    
    try {
      const quickValidation = await orchestrator.quickValidation();
      const mockReport = {
        timestamp: new Date().toISOString(),
        version: '0.1.0-test',
        overall_success: quickValidation.success,
        results: {
          unit_tests: { suite_name: 'Unit Tests', total_tests: 5, passed: 5, failed: 0, skipped: 0, duration_ms: 100, success_rate: 1.0, error_details: [] },
          integration_tests: { suite_name: 'Integration Tests', total_tests: 3, passed: 3, failed: 0, skipped: 0, duration_ms: 150, success_rate: 1.0, error_details: [] },
          performance_benchmarks: { timestamp: '', version: '', tool_consistency: { consistency_rate: 0.9, meets_target: true, details: {} }, cache_performance: { hit_rate: 0.85, accuracy: 0.9, average_response_time: 100, meets_targets: { hit_rate: true, accuracy: true } }, error_recovery: { average_recovery_time: 20000, success_rate: 0.95, meets_targets: true, error_breakdown: {}, recovery_strategies_used: {} }, cross_environment: { adaptation_success_rate: 0.8, environments_tested: [], successful_adaptations: 1, failed_adaptations: 0, meets_targets: true }, overall_success: true },
          e2e_scenarios: { tool_selection_consistency: { success_rate: 0.9, mcp_tool_usage_rate: 0.9, meets_target: true }, cross_environment_portability: { adaptation_success_rate: 0.8, environments_tested: 1, meets_target: true }, error_recovery: { average_recovery_time: 20000, success_rate: 0.95, meets_target: true }, user_experience_validation: { response_time_percentile_95: 1500, error_message_clarity: 0.9, meets_target: true } },
          feature_flag_validation: { total_flags: 5, enabled_flags: 5, rollout_health: {}, ab_tests_active: 0, rollback_events: 0 }
        },
        recommendations: [],
        next_steps: [],
        detailed_logs: []
      };
      
      const report = await reporter.generateReport(mockReport, 'console');
      logTest('Orchestrator-Reporter integration', report.length > 0, 'Failed to generate integrated report');
      
    } catch (error) {
      logTest('Orchestrator-Reporter integration', false, error.message);
    }
    
  } catch (error) {
    logTest('Component integration', false, error.message);
  }

  // Test Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 PHASE 4 INTEGRATION TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testsTotal}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Success Rate: ${((testsPassed / testsTotal) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Phase 4 implementation is working correctly.');
    return true;
  } else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed. Review the issues above.`);
    
    // Show failed tests
    console.log('\nFailed Tests:');
    testResults
      .filter(t => !t.success)
      .forEach(t => console.log(`  ❌ ${t.name}: ${t.details}`));
    
    return false;
  }
}

// Run the test
testPhase4Integration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });