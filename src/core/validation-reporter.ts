/**
 * Phase 4: Validation Reporter
 * 
 * Comprehensive reporting system for validation results
 * with stakeholder notifications and detailed analytics
 */

import { ValidationReport, TestResults, E2EResults, FeatureFlagResults } from './test-orchestrator.js';
import { BenchmarkResults } from './performance-monitor.js';

export interface ReportConfig {
  output_format: 'json' | 'html' | 'markdown' | 'console';
  include_details: boolean;
  include_recommendations: boolean;
  include_historical_comparison: boolean;
  notification_channels: ('email' | 'slack' | 'webhook' | 'console')[];
  report_retention_days: number;
  auto_save: boolean;
}

export interface HistoricalComparison {
  previous_report: ValidationReport | null;
  improvements: string[];
  regressions: string[];
  trend_analysis: {
    tool_consistency_trend: 'improving' | 'stable' | 'declining';
    cache_performance_trend: 'improving' | 'stable' | 'declining';
    error_recovery_trend: 'improving' | 'stable' | 'declining';
    overall_trend: 'improving' | 'stable' | 'declining';
  };
}

export interface NotificationPayload {
  channel: string;
  title: string;
  summary: string;
  details: string;
  status: 'success' | 'warning' | 'failure';
  url?: string;
  timestamp: string;
}

export class ValidationReporter {
  private config: ReportConfig;
  private reportHistory: ValidationReport[] = [];

  constructor(config: Partial<ReportConfig> = {}) {
    this.config = {
      output_format: 'console',
      include_details: true,
      include_recommendations: true,
      include_historical_comparison: true,
      notification_channels: ['console'],
      report_retention_days: 30,
      auto_save: true,
      ...config
    };
  }

  /**
   * Generate comprehensive validation report in specified format
   */
  async generateReport(
    validationResult: ValidationReport,
    format?: 'json' | 'html' | 'markdown' | 'console'
  ): Promise<string> {
    const outputFormat = format || this.config.output_format;
    
    // Add historical comparison if enabled
    let historicalComparison: HistoricalComparison | null = null;
    if (this.config.include_historical_comparison && this.reportHistory.length > 0) {
      historicalComparison = await this.generateHistoricalComparison(validationResult);
    }

    // Generate report based on format
    switch (outputFormat) {
      case 'json':
        return this.generateJSONReport(validationResult, historicalComparison);
      case 'html':
        return this.generateHTMLReport(validationResult, historicalComparison);
      case 'markdown':
        return this.generateMarkdownReport(validationResult, historicalComparison);
      case 'console':
        return this.generateConsoleReport(validationResult, historicalComparison);
      default:
        throw new Error(`Unsupported report format: ${outputFormat}`);
    }
  }

  /**
   * Save report to file system
   */
  async saveReport(report: ValidationReport, customPath?: string): Promise<string> {
    if (!this.config.auto_save && !customPath) {
      return '';
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const reportsDir = './.claude-playwright/reports';
      await fs.mkdir(reportsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = customPath || `validation-report-${timestamp}.json`;
      const filepath = path.resolve(reportsDir, filename);
      
      // Generate JSON report with full details
      const reportContent = await this.generateReport(report, 'json');
      await fs.writeFile(filepath, reportContent, 'utf-8');
      
      // Update history
      this.reportHistory.push(report);
      await this.pruneReportHistory();
      
      return filepath;
    } catch (error) {
      console.error(`Failed to save report: ${error}`);
      return '';
    }
  }

  /**
   * Send notifications to configured channels
   */
  async sendNotifications(report: ValidationReport): Promise<void> {
    const notifications = await this.prepareNotifications(report);
    
    const promises = this.config.notification_channels.map(channel =>
      this.sendNotification(channel, notifications[channel])
    );
    
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error(`Failed to send some notifications: ${error}`);
    }
  }

  /**
   * Generate performance dashboard data
   */
  generateDashboardData(reports: ValidationReport[]): {
    metrics_over_time: any[];
    success_rate_trend: number[];
    performance_trends: Record<string, number[]>;
    recent_issues: string[];
    recommendations_summary: Record<string, number>;
  } {
    if (reports.length === 0) {
      return {
        metrics_over_time: [],
        success_rate_trend: [],
        performance_trends: {},
        recent_issues: [],
        recommendations_summary: {}
      };
    }

    const metricsOverTime = reports.map(report => ({
      timestamp: report.timestamp,
      overall_success: report.overall_success,
      tool_consistency: report.results.performance_benchmarks.tool_consistency.consistency_rate,
      cache_hit_rate: report.results.performance_benchmarks.cache_performance.hit_rate,
      error_recovery_time: report.results.e2e_scenarios.error_recovery.average_recovery_time,
      unit_test_success: report.results.unit_tests.success_rate,
      integration_test_success: report.results.integration_tests.success_rate
    }));

    const successRateTrend = reports.map(r => r.overall_success ? 1 : 0);
    
    const performanceTrends = {
      tool_consistency: reports.map(r => r.results.performance_benchmarks.tool_consistency.consistency_rate),
      cache_hit_rate: reports.map(r => r.results.performance_benchmarks.cache_performance.hit_rate),
      error_recovery: reports.map(r => r.results.e2e_scenarios.error_recovery.average_recovery_time)
    };

    // Get recent issues from last 5 reports
    const recentReports = reports.slice(-5);
    const recentIssues: string[] = [];
    
    recentReports.forEach(report => {
      if (!report.overall_success) {
        recentIssues.push(`${new Date(report.timestamp).toLocaleDateString()}: Validation failed`);
      }
      
      if (!report.results.performance_benchmarks.tool_consistency.meets_target) {
        recentIssues.push(`${new Date(report.timestamp).toLocaleDateString()}: Tool consistency below target`);
      }
      
      if (!report.results.performance_benchmarks.cache_performance.meets_targets.hit_rate) {
        recentIssues.push(`${new Date(report.timestamp).toLocaleDateString()}: Cache hit rate below target`);
      }
    });

    // Summarize recommendations
    const recommendationsSummary: Record<string, number> = {};
    reports.forEach(report => {
      report.recommendations.forEach(rec => {
        const key = rec.split('.')[0] || rec.substring(0, 50); // First sentence or 50 chars
        recommendationsSummary[key] = (recommendationsSummary[key] || 0) + 1;
      });
    });

    return {
      metrics_over_time: metricsOverTime,
      success_rate_trend: successRateTrend,
      performance_trends: performanceTrends,
      recent_issues: recentIssues.slice(-10), // Last 10 issues
      recommendations_summary: recommendationsSummary
    };
  }

  // Private methods for report generation

  private generateJSONReport(report: ValidationReport, comparison: HistoricalComparison | null): string {
    const reportData = {
      ...report,
      historical_comparison: comparison,
      generated_at: new Date().toISOString(),
      config: this.config
    };
    
    return JSON.stringify(reportData, null, 2);
  }

  private generateMarkdownReport(report: ValidationReport, comparison: HistoricalComparison | null): string {
    const statusEmoji = report.overall_success ? '✅' : '❌';
    const timestamp = new Date(report.timestamp).toLocaleString();
    
    let markdown = `# 📊 MCP Validation Report ${statusEmoji}

**Generated:** ${timestamp}  
**Version:** ${report.version}  
**Overall Status:** ${report.overall_success ? 'PASSED' : 'FAILED'}

---

## 🧪 Test Results Summary

### Unit Tests
- **Success Rate:** ${(report.results.unit_tests.success_rate * 100).toFixed(1)}%
- **Tests:** ${report.results.unit_tests.passed}/${report.results.unit_tests.total_tests} passed
- **Duration:** ${report.results.unit_tests.duration_ms}ms
- **Coverage:** ${report.results.unit_tests.coverage_percentage || 'N/A'}%

### Integration Tests  
- **Success Rate:** ${(report.results.integration_tests.success_rate * 100).toFixed(1)}%
- **Tests:** ${report.results.integration_tests.passed}/${report.results.integration_tests.total_tests} passed
- **Duration:** ${report.results.integration_tests.duration_ms}ms

### Performance Benchmarks
- **Tool Consistency:** ${(report.results.performance_benchmarks.tool_consistency.consistency_rate * 100).toFixed(1)}% (Target: 90%)
- **Cache Hit Rate:** ${(report.results.performance_benchmarks.cache_performance.hit_rate * 100).toFixed(1)}% (Target: 85%)
- **Error Recovery:** ${report.results.e2e_scenarios.error_recovery.average_recovery_time.toFixed(0)}ms (Target: <30,000ms)

### E2E Scenarios
- **Cross-Environment:** ${(report.results.e2e_scenarios.cross_environment_portability.adaptation_success_rate * 100).toFixed(1)}% success
- **User Experience:** ${(report.results.e2e_scenarios.user_experience_validation.error_message_clarity * 100).toFixed(1)}% clarity

### Feature Flags
- **Active Flags:** ${report.results.feature_flag_validation.enabled_flags}/${report.results.feature_flag_validation.total_flags}
- **Rollback Events:** ${report.results.feature_flag_validation.rollback_events}
- **A/B Tests:** ${report.results.feature_flag_validation.ab_tests_active}

---

## 🎯 Key Metrics Status

| Metric | Current | Target | Status |
|--------|---------|--------|---------|
| Tool Consistency | ${(report.results.performance_benchmarks.tool_consistency.consistency_rate * 100).toFixed(1)}% | 90% | ${report.results.performance_benchmarks.tool_consistency.meets_target ? '✅' : '❌'} |
| Cache Hit Rate | ${(report.results.performance_benchmarks.cache_performance.hit_rate * 100).toFixed(1)}% | 85% | ${report.results.performance_benchmarks.cache_performance.meets_targets.hit_rate ? '✅' : '❌'} |
| Error Recovery | ${report.results.e2e_scenarios.error_recovery.average_recovery_time.toFixed(0)}ms | <30,000ms | ${report.results.e2e_scenarios.error_recovery.meets_target ? '✅' : '❌'} |

`;

    // Add historical comparison if available
    if (comparison && comparison.previous_report) {
      markdown += `---

## 📈 Historical Comparison

### Trends
- **Tool Consistency:** ${comparison.trend_analysis.tool_consistency_trend}
- **Cache Performance:** ${comparison.trend_analysis.cache_performance_trend}  
- **Error Recovery:** ${comparison.trend_analysis.error_recovery_trend}
- **Overall:** ${comparison.trend_analysis.overall_trend}

### Improvements
${comparison.improvements.map(i => `- ${i}`).join('\n')}

### Regressions
${comparison.regressions.map(r => `- ${r}`).join('\n')}

`;
    }

    // Add recommendations
    if (this.config.include_recommendations && report.recommendations.length > 0) {
      markdown += `---

## 💡 Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

`;
    }

    // Add next steps
    if (report.next_steps.length > 0) {
      markdown += `---

## 🚀 Next Steps

${report.next_steps.map(step => `- ${step}`).join('\n')}

`;
    }

    markdown += `---

*Generated by claude-playwright Phase 4 Validation Suite*
`;

    return markdown;
  }

  private generateHTMLReport(report: ValidationReport, comparison: HistoricalComparison | null): string {
    const statusClass = report.overall_success ? 'success' : 'failure';
    const statusText = report.overall_success ? 'PASSED' : 'FAILED';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Validation Report - ${statusText}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
        .status.success { color: #28a745; }
        .status.failure { color: #dc3545; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; border-radius: 6px; padding: 20px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .target-met { color: #28a745; }
        .target-missed { color: #dc3545; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 20px 0; }
        .trend-up { color: #28a745; }
        .trend-down { color: #dc3545; }
        .trend-stable { color: #6c757d; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(45deg, #007bff, #0056b3); transition: width 0.3s ease; }
        .timestamp { color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 MCP Validation Report</h1>
            <h2 class="status ${statusClass}">${statusText}</h2>
            <div class="timestamp">Generated: ${new Date(report.timestamp).toLocaleString()}</div>
            <div class="timestamp">Version: ${report.version}</div>
        </div>

        <div class="metric-grid">
            <div class="metric-card">
                <h3>🧩 Unit Tests</h3>
                <div class="metric-value ${report.results.unit_tests.success_rate >= 0.95 ? 'target-met' : 'target-missed'}">
                    ${(report.results.unit_tests.success_rate * 100).toFixed(1)}%
                </div>
                <div>${report.results.unit_tests.passed}/${report.results.unit_tests.total_tests} passed</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${report.results.unit_tests.success_rate * 100}%"></div>
                </div>
            </div>

            <div class="metric-card">
                <h3>🔗 Integration Tests</h3>
                <div class="metric-value ${report.results.integration_tests.success_rate >= 0.90 ? 'target-met' : 'target-missed'}">
                    ${(report.results.integration_tests.success_rate * 100).toFixed(1)}%
                </div>
                <div>${report.results.integration_tests.passed}/${report.results.integration_tests.total_tests} passed</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${report.results.integration_tests.success_rate * 100}%"></div>
                </div>
            </div>

            <div class="metric-card">
                <h3>🎯 Tool Consistency</h3>
                <div class="metric-value ${report.results.performance_benchmarks.tool_consistency.meets_target ? 'target-met' : 'target-missed'}">
                    ${(report.results.performance_benchmarks.tool_consistency.consistency_rate * 100).toFixed(1)}%
                </div>
                <div>Target: 90%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${report.results.performance_benchmarks.tool_consistency.consistency_rate * 100}%"></div>
                </div>
            </div>

            <div class="metric-card">
                <h3>⚡ Cache Hit Rate</h3>
                <div class="metric-value ${report.results.performance_benchmarks.cache_performance.meets_targets.hit_rate ? 'target-met' : 'target-missed'}">
                    ${(report.results.performance_benchmarks.cache_performance.hit_rate * 100).toFixed(1)}%
                </div>
                <div>Target: 85%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${report.results.performance_benchmarks.cache_performance.hit_rate * 100}%"></div>
                </div>
            </div>

            <div class="metric-card">
                <h3>🔄 Error Recovery</h3>
                <div class="metric-value ${report.results.e2e_scenarios.error_recovery.meets_target ? 'target-met' : 'target-missed'}">
                    ${report.results.e2e_scenarios.error_recovery.average_recovery_time.toFixed(0)}ms
                </div>
                <div>Target: &lt;30,000ms</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min((30000 - report.results.e2e_scenarios.error_recovery.average_recovery_time) / 30000 * 100, 100)}%"></div>
                </div>
            </div>

            <div class="metric-card">
                <h3>🚩 Feature Flags</h3>
                <div class="metric-value ${report.results.feature_flag_validation.rollback_events === 0 ? 'target-met' : 'target-missed'}">
                    ${report.results.feature_flag_validation.enabled_flags}/${report.results.feature_flag_validation.total_flags}
                </div>
                <div>${report.results.feature_flag_validation.rollback_events} rollback events</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(report.results.feature_flag_validation.enabled_flags / report.results.feature_flag_validation.total_flags) * 100}%"></div>
                </div>
            </div>
        </div>

        ${report.recommendations.length > 0 ? `
        <div class="recommendations">
            <h3>💡 Recommendations</h3>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        ${report.next_steps.length > 0 ? `
        <div class="recommendations">
            <h3>🚀 Next Steps</h3>
            <ul>
                ${report.next_steps.map(step => `<li>${step}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #6c757d;">
            <em>Generated by claude-playwright Phase 4 Validation Suite</em>
        </div>
    </div>
</body>
</html>`;
  }

  private generateConsoleReport(report: ValidationReport, comparison: HistoricalComparison | null): string {
    const statusSymbol = report.overall_success ? '✅' : '❌';
    const timestamp = new Date(report.timestamp).toLocaleString();
    
    let output = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                     📊 MCP VALIDATION REPORT ${statusSymbol}                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

Generated: ${timestamp}
Version: ${report.version}
Overall Status: ${report.overall_success ? 'PASSED' : 'FAILED'}

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧪 TEST RESULTS SUMMARY                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Unit Tests:        ${(report.results.unit_tests.success_rate * 100).toFixed(1).padStart(6)}% (${report.results.unit_tests.passed}/${report.results.unit_tests.total_tests} passed) │
│ Integration Tests: ${(report.results.integration_tests.success_rate * 100).toFixed(1).padStart(6)}% (${report.results.integration_tests.passed}/${report.results.integration_tests.total_tests} passed) │
│ Coverage:          ${(report.results.unit_tests.coverage_percentage || 0).toString().padStart(6)}%                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎯 PERFORMANCE BENCHMARKS                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tool Consistency:  ${(report.results.performance_benchmarks.tool_consistency.consistency_rate * 100).toFixed(1).padStart(6)}% ${report.results.performance_benchmarks.tool_consistency.meets_target ? '✅' : '❌'} (Target: 90%)    │
│ Cache Hit Rate:    ${(report.results.performance_benchmarks.cache_performance.hit_rate * 100).toFixed(1).padStart(6)}% ${report.results.performance_benchmarks.cache_performance.meets_targets.hit_rate ? '✅' : '❌'} (Target: 85%)    │
│ Cache Accuracy:    ${(report.results.performance_benchmarks.cache_performance.accuracy * 100).toFixed(1).padStart(6)}% ${report.results.performance_benchmarks.cache_performance.meets_targets.accuracy ? '✅' : '❌'} (Target: 90%)    │
│ Error Recovery:    ${report.results.e2e_scenarios.error_recovery.average_recovery_time.toFixed(0).padStart(6)}ms ${report.results.e2e_scenarios.error_recovery.meets_target ? '✅' : '❌'} (Target: <30s)  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎭 E2E SCENARIOS                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Cross-Environment: ${(report.results.e2e_scenarios.cross_environment_portability.adaptation_success_rate * 100).toFixed(1).padStart(6)}% ${report.results.e2e_scenarios.cross_environment_portability.meets_target ? '✅' : '❌'} (Target: 80%)    │
│ User Experience:   ${(report.results.e2e_scenarios.user_experience_validation.error_message_clarity * 100).toFixed(1).padStart(6)}% ${report.results.e2e_scenarios.user_experience_validation.meets_target ? '✅' : '❌'} (Target: 85%)    │
│ Response Time:     ${report.results.e2e_scenarios.user_experience_validation.response_time_percentile_95.toFixed(0).padStart(6)}ms (95th percentile)  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚩 FEATURE FLAGS                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Active Flags:      ${report.results.feature_flag_validation.enabled_flags}/${report.results.feature_flag_validation.total_flags}                                    │
│ Rollback Events:   ${report.results.feature_flag_validation.rollback_events.toString().padStart(6)} ${report.results.feature_flag_validation.rollback_events === 0 ? '✅' : '⚠️'}                                │
│ A/B Tests Active:  ${report.results.feature_flag_validation.ab_tests_active.toString().padStart(6)}                                    │
└─────────────────────────────────────────────────────────────────────────────┘
`;

    // Add recommendations if they exist
    if (this.config.include_recommendations && report.recommendations.length > 0) {
      output += `
┌─────────────────────────────────────────────────────────────────────────────┐
│ 💡 RECOMMENDATIONS                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
`;
      report.recommendations.forEach(rec => {
        const lines = this.wrapText(rec, 73);
        lines.forEach((line, index) => {
          output += `│ ${index === 0 ? '•' : ' '} ${line.padEnd(73)} │\n`;
        });
      });
      output += `└─────────────────────────────────────────────────────────────────────────────┘\n`;
    }

    // Add next steps
    if (report.next_steps.length > 0) {
      output += `
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚀 NEXT STEPS                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
`;
      report.next_steps.forEach(step => {
        const lines = this.wrapText(step, 73);
        lines.forEach((line, index) => {
          output += `│ ${index === 0 ? '→' : ' '} ${line.padEnd(73)} │\n`;
        });
      });
      output += `└─────────────────────────────────────────────────────────────────────────────┘\n`;
    }

    output += `
Generated by claude-playwright Phase 4 Validation Suite
`;

    return output;
  }

  private async generateHistoricalComparison(current: ValidationReport): Promise<HistoricalComparison> {
    const previous = this.reportHistory[this.reportHistory.length - 1] || null;
    
    const improvements: string[] = [];
    const regressions: string[] = [];
    
    if (previous) {
      // Compare tool consistency
      const currentToolConsistency = current.results.performance_benchmarks.tool_consistency.consistency_rate;
      const previousToolConsistency = previous.results.performance_benchmarks.tool_consistency.consistency_rate;
      
      if (currentToolConsistency > previousToolConsistency) {
        improvements.push(`Tool consistency improved: ${(previousToolConsistency * 100).toFixed(1)}% → ${(currentToolConsistency * 100).toFixed(1)}%`);
      } else if (currentToolConsistency < previousToolConsistency) {
        regressions.push(`Tool consistency declined: ${(previousToolConsistency * 100).toFixed(1)}% → ${(currentToolConsistency * 100).toFixed(1)}%`);
      }
      
      // Compare cache hit rate
      const currentCacheHitRate = current.results.performance_benchmarks.cache_performance.hit_rate;
      const previousCacheHitRate = previous.results.performance_benchmarks.cache_performance.hit_rate;
      
      if (currentCacheHitRate > previousCacheHitRate) {
        improvements.push(`Cache hit rate improved: ${(previousCacheHitRate * 100).toFixed(1)}% → ${(currentCacheHitRate * 100).toFixed(1)}%`);
      } else if (currentCacheHitRate < previousCacheHitRate) {
        regressions.push(`Cache hit rate declined: ${(previousCacheHitRate * 100).toFixed(1)}% → ${(currentCacheHitRate * 100).toFixed(1)}%`);
      }
      
      // Compare error recovery time
      const currentErrorRecovery = current.results.e2e_scenarios.error_recovery.average_recovery_time;
      const previousErrorRecovery = previous.results.e2e_scenarios.error_recovery.average_recovery_time;
      
      if (currentErrorRecovery < previousErrorRecovery) {
        improvements.push(`Error recovery time improved: ${previousErrorRecovery.toFixed(0)}ms → ${currentErrorRecovery.toFixed(0)}ms`);
      } else if (currentErrorRecovery > previousErrorRecovery) {
        regressions.push(`Error recovery time increased: ${previousErrorRecovery.toFixed(0)}ms → ${currentErrorRecovery.toFixed(0)}ms`);
      }
    }
    
    const trendAnalysis = this.calculateTrends(current, previous);
    
    return {
      previous_report: previous,
      improvements,
      regressions,
      trend_analysis: trendAnalysis
    };
  }

  private calculateTrends(current: ValidationReport, previous: ValidationReport | null): HistoricalComparison['trend_analysis'] {
    if (!previous) {
      return {
        tool_consistency_trend: 'stable',
        cache_performance_trend: 'stable',
        error_recovery_trend: 'stable',
        overall_trend: 'stable'
      };
    }
    
    const toolConsistencyTrend = this.getTrend(
      current.results.performance_benchmarks.tool_consistency.consistency_rate,
      previous.results.performance_benchmarks.tool_consistency.consistency_rate
    );
    
    const cachePerformanceTrend = this.getTrend(
      current.results.performance_benchmarks.cache_performance.hit_rate,
      previous.results.performance_benchmarks.cache_performance.hit_rate
    );
    
    const errorRecoveryTrend = this.getTrend(
      -current.results.e2e_scenarios.error_recovery.average_recovery_time, // Negative because lower is better
      -previous.results.e2e_scenarios.error_recovery.average_recovery_time
    );
    
    const overallTrend = [toolConsistencyTrend, cachePerformanceTrend, errorRecoveryTrend]
      .includes('improving') ? 'improving' :
      [toolConsistencyTrend, cachePerformanceTrend, errorRecoveryTrend]
        .includes('declining') ? 'declining' : 'stable';
    
    return {
      tool_consistency_trend: toolConsistencyTrend,
      cache_performance_trend: cachePerformanceTrend,
      error_recovery_trend: errorRecoveryTrend,
      overall_trend: overallTrend
    };
  }

  private getTrend(current: number, previous: number): 'improving' | 'stable' | 'declining' {
    const threshold = 0.02; // 2% change threshold
    const change = (current - previous) / previous;
    
    if (change > threshold) return 'improving';
    if (change < -threshold) return 'declining';
    return 'stable';
  }

  private async prepareNotifications(report: ValidationReport): Promise<Record<string, NotificationPayload>> {
    const status: 'success' | 'warning' | 'failure' = report.overall_success ? 'success' : 'failure';
    const title = `MCP Validation ${status.toUpperCase()}`;
    const summary = this.generateNotificationSummary(report);
    const details = this.generateNotificationDetails(report);
    
    const basePayload: NotificationPayload = {
      channel: '',
      title,
      summary,
      details,
      status,
      timestamp: report.timestamp
    };
    
    return {
      console: { ...basePayload, channel: 'console' },
      email: { ...basePayload, channel: 'email' },
      slack: { ...basePayload, channel: 'slack' },
      webhook: { ...basePayload, channel: 'webhook' }
    };
  }

  private generateNotificationSummary(report: ValidationReport): string {
    const toolConsistency = (report.results.performance_benchmarks.tool_consistency.consistency_rate * 100).toFixed(1);
    const cacheHitRate = (report.results.performance_benchmarks.cache_performance.hit_rate * 100).toFixed(1);
    const errorRecovery = report.results.e2e_scenarios.error_recovery.average_recovery_time.toFixed(0);
    
    return `Tool Consistency: ${toolConsistency}%, Cache Hit Rate: ${cacheHitRate}%, Error Recovery: ${errorRecovery}ms`;
  }

  private generateNotificationDetails(report: ValidationReport): string {
    let details = `Unit Tests: ${(report.results.unit_tests.success_rate * 100).toFixed(1)}%\n`;
    details += `Integration Tests: ${(report.results.integration_tests.success_rate * 100).toFixed(1)}%\n`;
    details += `Feature Flags: ${report.results.feature_flag_validation.enabled_flags}/${report.results.feature_flag_validation.total_flags} active\n`;
    
    if (report.recommendations.length > 0) {
      details += `\nRecommendations: ${report.recommendations.length} items\n`;
      details += report.recommendations.slice(0, 3).map(r => `- ${r}`).join('\n');
    }
    
    return details;
  }

  private async sendNotification(channel: string, payload: NotificationPayload): Promise<void> {
    switch (channel) {
      case 'console':
        console.log(`\n[${payload.status.toUpperCase()}] ${payload.title}`);
        console.log(payload.summary);
        if (this.config.include_details) {
          console.log('\nDetails:');
          console.log(payload.details);
        }
        break;
        
      case 'email':
        // In real implementation, would integrate with email service
        console.log(`📧 Email notification sent: ${payload.title}`);
        break;
        
      case 'slack':
        // In real implementation, would integrate with Slack API
        console.log(`💬 Slack notification sent: ${payload.title}`);
        break;
        
      case 'webhook':
        // In real implementation, would send HTTP POST to webhook URL
        console.log(`🔗 Webhook notification sent: ${payload.title}`);
        break;
        
      default:
        console.warn(`Unknown notification channel: ${channel}`);
    }
  }

  private async pruneReportHistory(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.report_retention_days * 24 * 60 * 60 * 1000);
    
    this.reportHistory = this.reportHistory.filter(report => 
      new Date(report.timestamp).getTime() > cutoffTime
    );
    
    // Keep maximum of 100 reports
    if (this.reportHistory.length > 100) {
      this.reportHistory = this.reportHistory.slice(-100);
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  // Public API methods
  
  public updateConfig(newConfig: Partial<ReportConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  public getConfig(): ReportConfig {
    return { ...this.config };
  }
  
  public addToHistory(report: ValidationReport): void {
    this.reportHistory.push(report);
  }
  
  public getHistory(): ValidationReport[] {
    return [...this.reportHistory];
  }
  
  public clearHistory(): void {
    this.reportHistory = [];
  }
}

export default ValidationReporter;