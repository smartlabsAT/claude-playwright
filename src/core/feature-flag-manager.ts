/**
 * Phase 4: Feature Flag Management System
 * 
 * Enables gradual rollout and A/B testing of MCP reliability improvements
 * with comprehensive monitoring and configuration management
 */

export interface FeatureFlagConfig {
  mcp_naming_v2: {
    enabled: boolean;
    rollout_percentage: number;      // 0-100
    user_groups: string[];           // ['beta', 'internal', 'production']
    metric_tracking: string[];       // Metrics to monitor during rollout
    description: string;
  };
  enhanced_caching: {
    enabled: boolean;
    rollout_percentage: number;
    dom_signature_enabled: boolean;   // Sub-feature flag
    similarity_threshold: number;     // A/B test different values
    metric_tracking: string[];
    description: string;
  };
  circuit_breaker: {
    enabled: boolean;
    rollout_percentage: number;
    failure_threshold: number;        // Configurable threshold for testing
    recovery_timeout: number;         // Configurable recovery time
    metric_tracking: string[];
    description: string;
  };
  intelligent_testing: {
    enabled: boolean;
    rollout_percentage: number;
    auto_test_creation: boolean;     // Auto-create tests from interactions
    semantic_matching: boolean;      // Semantic test discovery
    metric_tracking: string[];
    description: string;
  };
  performance_monitoring: {
    enabled: boolean;
    rollout_percentage: number;
    detailed_logging: boolean;       // Comprehensive performance logging
    real_time_alerts: boolean;       // Real-time performance alerts
    metric_tracking: string[];
    description: string;
  };
}

export interface FeatureFlagMetrics {
  feature_name: string;
  enabled_users: number;
  total_users: number;
  rollout_percentage: number;
  success_metrics: Record<string, number>;
  error_metrics: Record<string, number>;
  performance_impact: {
    average_response_time: number;
    error_rate: number;
    user_satisfaction: number;
  };
  last_updated: string;
}

export interface RolloutStrategy {
  type: 'percentage' | 'user_group' | 'canary' | 'blue_green';
  target_percentage: number;
  duration_hours: number;
  success_criteria: {
    min_success_rate: number;
    max_error_rate: number;
    min_user_satisfaction: number;
  };
  rollback_triggers: {
    error_rate_threshold: number;
    performance_degradation_threshold: number;
    user_complaint_threshold: number;
  };
}

class FeatureFlagManager {
  private config: FeatureFlagConfig;
  private metricsHistory: Map<string, FeatureFlagMetrics[]> = new Map();
  private rolloutStrategies: Map<string, RolloutStrategy> = new Map();

  constructor(configPath?: string) {
    this.config = this.loadDefaultConfig();
    
    if (configPath) {
      this.loadConfigFromFile(configPath);
    }
    
    this.initializeDefaultRolloutStrategies();
  }

  private loadDefaultConfig(): FeatureFlagConfig {
    return {
      mcp_naming_v2: {
        enabled: true,
        rollout_percentage: 100, // Fully rolled out after Phase 1
        user_groups: ['production'],
        metric_tracking: ['tool_selection_rate', 'user_satisfaction', 'error_rate'],
        description: 'MCP tool naming convention v2 with progressive loading'
      },
      enhanced_caching: {
        enabled: true,
        rollout_percentage: 100, // Fully rolled out after Phase 2
        dom_signature_enabled: true,
        similarity_threshold: 0.35, // Optimized threshold from Phase 2
        metric_tracking: ['cache_hit_rate', 'response_time', 'accuracy'],
        description: 'Enhanced caching with DOM signatures and context-aware similarity'
      },
      circuit_breaker: {
        enabled: true,
        rollout_percentage: 100, // Fully rolled out after Phase 3
        failure_threshold: 5, // 5 failures trigger circuit breaker
        recovery_timeout: 30000, // 30s recovery timeout
        metric_tracking: ['circuit_breaker_trips', 'recovery_time', 'fallback_success_rate'],
        description: 'Circuit breaker with graceful degradation and error recovery'
      },
      intelligent_testing: {
        enabled: true,
        rollout_percentage: 50, // Gradual rollout in Phase 4
        auto_test_creation: false, // Conservative start
        semantic_matching: true,
        metric_tracking: ['test_creation_rate', 'test_success_rate', 'user_adoption'],
        description: 'AI-powered intelligent test management and scenario persistence'
      },
      performance_monitoring: {
        enabled: true,
        rollout_percentage: 100, // Essential for validation
        detailed_logging: false, // Can impact performance
        real_time_alerts: true,
        metric_tracking: ['monitoring_overhead', 'alert_accuracy', 'response_time'],
        description: 'Comprehensive performance monitoring and validation suite'
      }
    };
  }

  private initializeDefaultRolloutStrategies(): void {
    // Conservative rollout for new features
    this.rolloutStrategies.set('conservative', {
      type: 'percentage',
      target_percentage: 100,
      duration_hours: 72, // 3 days
      success_criteria: {
        min_success_rate: 0.95,
        max_error_rate: 0.02,
        min_user_satisfaction: 0.85
      },
      rollback_triggers: {
        error_rate_threshold: 0.05,
        performance_degradation_threshold: 0.20,
        user_complaint_threshold: 10
      }
    });

    // Aggressive rollout for proven features
    this.rolloutStrategies.set('aggressive', {
      type: 'percentage', 
      target_percentage: 100,
      duration_hours: 24, // 1 day
      success_criteria: {
        min_success_rate: 0.90,
        max_error_rate: 0.05,
        min_user_satisfaction: 0.80
      },
      rollback_triggers: {
        error_rate_threshold: 0.10,
        performance_degradation_threshold: 0.30,
        user_complaint_threshold: 20
      }
    });

    // Canary rollout for experimental features
    this.rolloutStrategies.set('canary', {
      type: 'canary',
      target_percentage: 5, // Start with 5% canary
      duration_hours: 168, // 1 week
      success_criteria: {
        min_success_rate: 0.98,
        max_error_rate: 0.01,
        min_user_satisfaction: 0.90
      },
      rollback_triggers: {
        error_rate_threshold: 0.02,
        performance_degradation_threshold: 0.10,
        user_complaint_threshold: 5
      }
    });
  }

  /**
   * Check if a feature is enabled for a specific user/context
   */
  isEnabled(feature: keyof FeatureFlagConfig, userId?: string, userGroup?: string): boolean {
    const featureConfig = this.config[feature];
    if (!featureConfig || !featureConfig.enabled) {
      return false;
    }

    // User group override - always enable for specified groups
    if (userGroup && 'user_groups' in featureConfig && featureConfig.user_groups.includes(userGroup)) {
      return true;
    }

    // Percentage-based rollout using consistent hashing
    if (userId) {
      const hash = this.hashUserId(userId);
      return hash % 100 < featureConfig.rollout_percentage;
    }

    // Default to rollout percentage for anonymous users
    return Math.random() * 100 < featureConfig.rollout_percentage;
  }

  /**
   * Get feature configuration with dynamic values
   */
  getConfig<K extends keyof FeatureFlagConfig>(feature: K): FeatureFlagConfig[K] {
    return this.config[feature];
  }

  /**
   * Update feature flag configuration
   */
  updateFeatureConfig<K extends keyof FeatureFlagConfig>(
    feature: K,
    updates: Partial<FeatureFlagConfig[K]>
  ): void {
    this.config[feature] = { ...this.config[feature], ...updates };
    this.logConfigChange(feature, updates);
  }

  /**
   * Gradual rollout with automatic percentage increases
   */
  async startGradualRollout(
    feature: keyof FeatureFlagConfig, 
    strategyName: string = 'conservative'
  ): Promise<void> {
    const strategy = this.rolloutStrategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown rollout strategy: ${strategyName}`);
    }

    const featureConfig = this.config[feature];
    const startPercentage = featureConfig.rollout_percentage;
    const targetPercentage = strategy.target_percentage;
    
    if (startPercentage >= targetPercentage) {
      console.log(`Feature ${feature} already at target rollout: ${targetPercentage}%`);
      return;
    }

    console.log(`Starting gradual rollout for ${feature}: ${startPercentage}% → ${targetPercentage}%`);

    const incrementSteps = 5; // Increase by 20% each step (5 steps to 100%)
    const stepSize = (targetPercentage - startPercentage) / incrementSteps;
    const stepDuration = (strategy.duration_hours * 60 * 60 * 1000) / incrementSteps;

    for (let step = 1; step <= incrementSteps; step++) {
      const newPercentage = Math.min(startPercentage + (stepSize * step), targetPercentage);
      
      this.updateFeatureConfig(feature, { rollout_percentage: newPercentage } as any);
      
      console.log(`Rollout step ${step}/${incrementSteps}: ${feature} → ${newPercentage}%`);
      
      // Wait for step duration before next increment
      if (step < incrementSteps) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
        
        // Check success criteria and rollback triggers
        const shouldContinue = await this.validateRolloutStep(feature, strategy);
        if (!shouldContinue) {
          await this.rollbackFeature(feature, startPercentage);
          throw new Error(`Rollout halted for ${feature} due to failure criteria`);
        }
      }
    }

    console.log(`Gradual rollout completed for ${feature}: ${targetPercentage}%`);
  }

  /**
   * Emergency rollback of feature
   */
  async rollbackFeature(feature: keyof FeatureFlagConfig, rollbackPercentage: number = 0): Promise<void> {
    console.log(`🚨 Emergency rollback initiated for ${feature} → ${rollbackPercentage}%`);
    
    this.updateFeatureConfig(feature, { rollout_percentage: rollbackPercentage } as any);
    
    // Log rollback event
    this.recordMetric(feature, {
      event_type: 'rollback',
      timestamp: new Date().toISOString(),
      rollback_percentage: rollbackPercentage,
      reason: 'automated_trigger'
    });
  }

  /**
   * A/B test configuration for features with variants
   */
  setupABTest(
    feature: keyof FeatureFlagConfig,
    variantA: any,
    variantB: any,
    splitPercentage: number = 50
  ): void {
    const abTestConfig = {
      enabled: true,
      ab_test: {
        enabled: true,
        variant_a: variantA,
        variant_b: variantB,
        split_percentage: splitPercentage,
        started_at: new Date().toISOString()
      }
    };

    this.updateFeatureConfig(feature, abTestConfig as any);
    console.log(`A/B test started for ${feature}: ${splitPercentage}% variant A / ${100-splitPercentage}% variant B`);
  }

  /**
   * Get A/B test variant for user
   */
  getABVariant(feature: keyof FeatureFlagConfig, userId: string): 'A' | 'B' {
    const featureConfig = this.config[feature] as any;
    
    if (!featureConfig.ab_test?.enabled) {
      return 'A'; // Default variant
    }

    const hash = this.hashUserId(userId);
    return hash % 100 < featureConfig.ab_test.split_percentage ? 'A' : 'B';
  }

  /**
   * Record metrics for feature flag performance
   */
  recordMetric(feature: keyof FeatureFlagConfig, metric: any): void {
    const featureMetrics = this.metricsHistory.get(feature as string) || [];
    
    const newMetric: FeatureFlagMetrics = {
      feature_name: feature as string,
      enabled_users: metric.enabled_users || 0,
      total_users: metric.total_users || 0,
      rollout_percentage: this.config[feature].rollout_percentage,
      success_metrics: metric.success_metrics || {},
      error_metrics: metric.error_metrics || {},
      performance_impact: metric.performance_impact || {
        average_response_time: 0,
        error_rate: 0,
        user_satisfaction: 0
      },
      last_updated: new Date().toISOString()
    };

    featureMetrics.push(newMetric);
    
    // Keep only last 100 metrics per feature
    if (featureMetrics.length > 100) {
      featureMetrics.splice(0, featureMetrics.length - 100);
    }
    
    this.metricsHistory.set(feature as string, featureMetrics);
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [feature, metrics] of this.metricsHistory.entries()) {
      const latestMetric = metrics[metrics.length - 1];
      const config = this.config[feature as keyof FeatureFlagConfig];

      report[feature] = {
        current_status: {
          enabled: config.enabled,
          rollout_percentage: config.rollout_percentage,
          user_groups: 'user_groups' in config ? config.user_groups : [],
          description: config.description
        },
        latest_metrics: latestMetric,
        trend_analysis: this.calculateTrends(metrics),
        recommendations: this.generateRecommendations(feature, metrics)
      };
    }

    return report;
  }

  /**
   * Export configuration for backup/sharing
   */
  exportConfig(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      version: '1.0',
      config: this.config,
      rollout_strategies: Object.fromEntries(this.rolloutStrategies),
      metrics_summary: this.getMetricsReport()
    }, null, 2);
  }

  /**
   * Import configuration from backup
   */
  importConfig(configData: string): void {
    try {
      const data = JSON.parse(configData);
      
      if (data.config) {
        this.config = { ...this.config, ...data.config };
      }
      
      if (data.rollout_strategies) {
        this.rolloutStrategies = new Map(Object.entries(data.rollout_strategies));
      }
      
      console.log(`Configuration imported successfully (version: ${data.version})`);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }

  // Private helper methods
  private hashUserId(userId: string): number {
    // Consistent hash function for reproducible percentage-based rollout
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async loadConfigFromFile(configPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const configData = await fs.readFile(configPath, 'utf-8');
      const fileConfig = JSON.parse(configData);
      this.config = { ...this.config, ...fileConfig };
    } catch (error) {
      console.warn(`Could not load config from ${configPath}: ${error}`);
    }
  }

  private logConfigChange(feature: keyof FeatureFlagConfig, updates: any): void {
    console.log(`[FeatureFlag] ${feature} updated:`, updates);
  }

  private async validateRolloutStep(
    feature: keyof FeatureFlagConfig, 
    strategy: RolloutStrategy
  ): Promise<boolean> {
    // In real implementation, this would check actual metrics
    // For now, simulate validation
    
    const mockMetrics = {
      success_rate: 0.96,
      error_rate: 0.01,
      user_satisfaction: 0.87
    };

    return mockMetrics.success_rate >= strategy.success_criteria.min_success_rate &&
           mockMetrics.error_rate <= strategy.success_criteria.max_error_rate &&
           mockMetrics.user_satisfaction >= strategy.success_criteria.min_user_satisfaction;
  }

  private calculateTrends(metrics: FeatureFlagMetrics[]): any {
    if (metrics.length < 2) {
      return { trend: 'insufficient_data' };
    }

    const recent = metrics.slice(-5); // Last 5 metrics
    const older = metrics.slice(-10, -5); // Previous 5 metrics

    const recentAvg = recent.reduce((sum, m) => sum + m.performance_impact.average_response_time, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, m) => sum + m.performance_impact.average_response_time, 0) / older.length : recentAvg;

    const trend = recentAvg < olderAvg ? 'improving' : recentAvg > olderAvg ? 'degrading' : 'stable';

    return {
      trend,
      performance_change: ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1),
      sample_size: recent.length
    };
  }

  private generateRecommendations(feature: string, metrics: FeatureFlagMetrics[]): string[] {
    const recommendations: string[] = [];
    const latest = metrics[metrics.length - 1];

    if (latest?.performance_impact.error_rate > 0.05) {
      recommendations.push(`High error rate detected for ${feature}. Consider rollback or debugging.`);
    }

    if (latest?.rollout_percentage < 100 && latest?.performance_impact.user_satisfaction > 0.85) {
      recommendations.push(`${feature} showing good user satisfaction. Consider increasing rollout percentage.`);
    }

    if (metrics.length > 10) {
      const trend = this.calculateTrends(metrics);
      if (trend.trend === 'degrading') {
        recommendations.push(`Performance degrading trend detected for ${feature}. Monitor closely.`);
      }
    }

    return recommendations;
  }
}

export { FeatureFlagManager };
export default FeatureFlagManager;