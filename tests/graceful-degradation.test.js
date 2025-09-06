/**
 * Comprehensive Tests - Phase 3C Graceful Degradation System
 * 
 * Tests the complete graceful degradation implementation including:
 * - 4-level progressive degradation system
 * - Automatic circuit breaker integration
 * - Recovery strategies and coordination
 * - Simplified tool implementations
 * - User experience enhancements
 * - Integration with connection pooling
 */

import { test, expect } from '@jest/globals';
import { GracefulDegradationManager } from '../src/core/graceful-degradation.js';
import { GracefulDegradationIntegration } from '../src/core/graceful-degradation-integration.js';
import { RecoveryStrategiesManager } from '../src/core/recovery-strategies.js';
import { getSimplifiedTool, hasSimplifiedVersion } from '../src/core/simplified-tools.js';
import { ErrorType } from '../src/core/circuit-breaker-integration.js';

// Mock dependencies
jest.mock('../src/core/circuit-breaker-integration.js');
jest.mock('../src/core/connection-pool-manager.js');
jest.mock('../src/utils/project-paths.js', () => ({
  ProjectPaths: {
    getCacheDir: () => '/tmp/test-cache'
  }
}));

// Mock filesystem operations
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn()
  }
}));

describe('Graceful Degradation System - Phase 3C', () => {
  
  describe('GracefulDegradationManager', () => {
    let degradationManager;
    
    beforeEach(() => {
      // Clear any existing singleton instance
      if (GracefulDegradationManager.instance) {
        GracefulDegradationManager.instance = null;
      }
      degradationManager = GracefulDegradationManager.getInstance();
    });
    
    test('should initialize with LEVEL_1 (Full Functionality)', () => {
      expect(degradationManager.getCurrentLevel()).toBe('LEVEL_1');
    });
    
    test('should provide correct tools for each degradation level', () => {
      // Level 1 - Full functionality
      expect(degradationManager.isToolAvailable('mcp__playwright__mcp_browser_click')).toBe(true);
      expect(degradationManager.isToolAvailable('mcp__playwright__mcp_browser_type')).toBe(true);
      expect(degradationManager.isToolAvailable('mcp__playwright__mcp_session_restore')).toBe(true);
      
      // Degrade to Level 2
      degradationManager.degradeToLevel('LEVEL_2', 'Test degradation');
      expect(degradationManager.getCurrentLevel()).toBe('LEVEL_2');
      expect(degradationManager.isToolAvailable('mcp_browser_click_simple')).toBe(true);
      expect(degradationManager.isToolAvailable('mcp_browser_type_basic')).toBe(true);
      
      // Degrade to Level 3
      degradationManager.degradeToLevel('LEVEL_3', 'Further degradation');
      expect(degradationManager.getCurrentLevel()).toBe('LEVEL_3');
      expect(degradationManager.isToolAvailable('mcp_browser_snapshot_readonly')).toBe(true);
      expect(degradationManager.isToolAvailable('mcp_browser_screenshot_safe')).toBe(true);
      
      // Degrade to Level 4
      degradationManager.degradeToLevel('LEVEL_4', 'Maximum degradation');
      expect(degradationManager.getCurrentLevel()).toBe('LEVEL_4');
      expect(degradationManager.isToolAvailable('mcp_debug_console_readonly')).toBe(true);
      expect(degradationManager.isToolAvailable('mcp_system_status')).toBe(true);
    });
    
    test('should track degradation metrics correctly', async () => {
      // Initial state
      let metrics = degradationManager.getDegradationMetrics();
      expect(metrics.currentLevel).toBe('LEVEL_1');
      expect(metrics.totalDegradationEvents).toBe(0);
      
      // Degrade and check metrics
      await degradationManager.degradeToLevel('LEVEL_2', 'Circuit breaker opened');
      metrics = degradationManager.getDegradationMetrics();
      expect(metrics.currentLevel).toBe('LEVEL_2');
      expect(metrics.totalDegradationEvents).toBe(1);
      expect(metrics.degradationEventsByLevel.LEVEL_2).toBe(1);
    });
    
    test('should generate appropriate degradation status information', () => {
      const status = degradationManager.getDegradationStatus();
      
      expect(status.level).toBe('LEVEL_1');
      expect(status.config.name).toBe('Full Functionality');
      expect(status.ux.messaging.title).toContain('Full Functionality Active');
      expect(status.config.limitations).toHaveLength(0);
    });
    
    test('should handle circuit breaker events and auto-degrade', async () => {
      // Simulate circuit breaker opening
      await degradationManager.handleCircuitBreakerEvent(
        'browser_click',
        'OPEN',
        new Error('Too many failures')
      );
      
      // Should degrade from LEVEL_1
      expect(degradationManager.getCurrentLevel()).toBe('LEVEL_2');
      
      const metrics = degradationManager.getDegradationMetrics();
      expect(metrics.totalDegradationEvents).toBe(1);
    });
  });
  
  describe('Simplified Tools', () => {
    test('should have simplified versions for core tools', () => {
      expect(hasSimplifiedVersion('mcp__playwright__mcp_browser_click')).toBe(true);
      expect(hasSimplifiedVersion('mcp__playwright__mcp_browser_type')).toBe(true);
      expect(hasSimplifiedVersion('mcp__playwright__mcp_browser_navigate')).toBe(true);
      expect(hasSimplifiedVersion('mcp__playwright__mcp_browser_screenshot')).toBe(true);
      expect(hasSimplifiedVersion('mcp__playwright__mcp_browser_snapshot')).toBe(true);
    });
    
    test('should return null for tools without simplified versions', () => {
      expect(hasSimplifiedVersion('unknown_tool')).toBe(false);
      expect(getSimplifiedTool('unknown_tool')).toBeNull();
    });
    
    test('should provide working simplified tool implementations', () => {
      const simplifiedClick = getSimplifiedTool('mcp_browser_click_simple');
      expect(simplifiedClick).toBeInstanceOf(Function);
      
      const simplifiedType = getSimplifiedTool('mcp_browser_type_basic');
      expect(simplifiedType).toBeInstanceOf(Function);
      
      const simplifiedNavigate = getSimplifiedTool('mcp_browser_navigate_safe');
      expect(simplifiedNavigate).toBeInstanceOf(Function);
    });
  });
  
  describe('Recovery Strategies', () => {
    let recoveryManager;
    
    beforeEach(() => {
      if (RecoveryStrategiesManager.instance) {
        RecoveryStrategiesManager.instance = null;
      }
      recoveryManager = RecoveryStrategiesManager.getInstance();
    });
    
    test('should have recovery strategies for all error types', () => {
      const errorTypes = [
        ErrorType.BROWSER_CRASH,
        ErrorType.MEMORY_PRESSURE,
        ErrorType.NETWORK_TIMEOUT,
        ErrorType.CONNECTION_FAILURE,
        ErrorType.ELEMENT_NOT_FOUND,
        ErrorType.VALIDATION_ERROR
      ];
      
      errorTypes.forEach(errorType => {
        const strategy = recoveryManager.getRecommendedStrategy(errorType, {
          errorType,
          systemState: {
            degradationLevel: 'LEVEL_1',
            circuitBreakerState: 'OPEN',
            connectionPoolHealth: false,
            browserAlive: true
          },
          previousAttempts: 0,
          resourceConstraints: {
            maxMemoryUsage: 500,
            maxRecoveryTime: 30000,
            allowBrowserRestart: true
          },
          rollbackStack: []
        });
        
        expect(strategy).toBeTruthy();
        expect(strategy.errorType).toBe(errorType);
        expect(strategy.phases.length).toBeGreaterThan(0);
      });
    });
    
    test('should track recovery statistics', () => {
      const stats = recoveryManager.getRecoveryStatistics();
      
      expect(stats).toHaveProperty('totalAttempts');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageRecoveryTime');
      expect(stats).toHaveProperty('strategySuccessRates');
      expect(stats).toHaveProperty('recentTrends');
    });
    
    test('should execute recovery strategy phases', async () => {
      const mockContext = {
        errorType: ErrorType.NETWORK_TIMEOUT,
        systemState: {
          degradationLevel: 'LEVEL_1',
          circuitBreakerState: 'OPEN', 
          connectionPoolHealth: false,
          browserAlive: true
        },
        previousAttempts: 0,
        resourceConstraints: {
          maxMemoryUsage: 500,
          maxRecoveryTime: 30000,
          allowBrowserRestart: true
        },
        rollbackStack: []
      };
      
      const result = await recoveryManager.executeRecoveryStrategy(
        ErrorType.NETWORK_TIMEOUT,
        mockContext
      );
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('phasesExecuted');
      expect(result).toHaveProperty('totalDuration');
      expect(result).toHaveProperty('finalDegradationLevel');
      expect(result.phasesExecuted.length).toBeGreaterThan(0);
    });
  });
  
  describe('Degradation Integration', () => {
    let integration;
    
    beforeEach(() => {
      if (GracefulDegradationIntegration.instance) {
        GracefulDegradationIntegration.instance = null;
      }
      integration = GracefulDegradationIntegration.getInstance();
    });
    
    test('should provide system status with all components', () => {
      const status = integration.getSystemStatus();
      
      expect(status).toHaveProperty('degradationLevel');
      expect(status).toHaveProperty('circuitBreakerState');
      expect(status).toHaveProperty('connectionPoolHealth');
      expect(status).toHaveProperty('availableTools');
      expect(status).toHaveProperty('limitations');
      expect(status).toHaveProperty('recoveryStatus');
      expect(status).toHaveProperty('userGuidance');
      
      expect(Array.isArray(status.availableTools)).toBe(true);
      expect(Array.isArray(status.limitations)).toBe(true);
    });
    
    test('should coordinate recovery across components', async () => {
      const recoveryResult = await integration.coordinateRecovery();
      
      expect(recoveryResult).toHaveProperty('inProgress');
      expect(recoveryResult).toHaveProperty('coordinatedComponents');
      expect(recoveryResult).toHaveProperty('overallSuccess');
      expect(recoveryResult).toHaveProperty('partialRecoveries');
      expect(recoveryResult).toHaveProperty('failedRecoveries');
      
      expect(Array.isArray(recoveryResult.coordinatedComponents)).toBe(true);
      expect(recoveryResult.coordinatedComponents.length).toBeGreaterThan(0);
    });
    
    test('should generate comprehensive health report', async () => {
      const healthReport = await integration.getComprehensiveHealthReport();
      
      expect(healthReport).toHaveProperty('overall');
      expect(healthReport).toHaveProperty('components');
      expect(healthReport).toHaveProperty('userImpact');
      
      expect(healthReport.overall).toHaveProperty('healthy');
      expect(healthReport.overall).toHaveProperty('degradationLevel');
      expect(healthReport.overall).toHaveProperty('primaryIssues');
      expect(healthReport.overall).toHaveProperty('recoveryRecommendations');
      
      expect(healthReport.userImpact).toHaveProperty('availableFeatures');
      expect(healthReport.userImpact).toHaveProperty('unavailableFeatures'); 
      expect(healthReport.userImpact).toHaveProperty('workarounds');
    });
  });
  
  describe('User Experience Enhancements', () => {
    let degradationManager;
    
    beforeEach(() => {
      if (GracefulDegradationManager.instance) {
        GracefulDegradationManager.instance = null;
      }
      degradationManager = GracefulDegradationManager.getInstance();
    });
    
    test('should provide appropriate messaging for each level', () => {
      const levels = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'];
      
      levels.forEach(async (level) => {
        await degradationManager.degradeToLevel(level, `Testing ${level}`);
        const status = degradationManager.getDegradationStatus();
        
        expect(status.ux.messaging.title).toBeDefined();
        expect(status.ux.messaging.description).toBeDefined();
        expect(Array.isArray(status.ux.messaging.capabilities)).toBe(true);
        expect(Array.isArray(status.ux.messaging.limitations)).toBe(true);
        
        expect(Array.isArray(status.ux.suggestions.alternatives)).toBe(true);
        expect(Array.isArray(status.ux.suggestions.workarounds)).toBe(true);
        expect(Array.isArray(status.ux.suggestions.bestPractices)).toBe(true);
      });
    });
    
    test('should provide different messaging based on degradation level', async () => {
      // Level 1 - Full functionality
      let status = degradationManager.getDegradationStatus();
      expect(status.ux.messaging.title).toContain('Full Functionality');
      expect(status.ux.messaging.limitations).toHaveLength(0);
      
      // Level 2 - Simplified mode
      await degradationManager.degradeToLevel('LEVEL_2', 'Test');
      status = degradationManager.getDegradationStatus();
      expect(status.ux.messaging.title).toContain('Simplified Mode');
      expect(status.ux.messaging.limitations.length).toBeGreaterThan(0);
      
      // Level 3 - Read-only mode
      await degradationManager.degradeToLevel('LEVEL_3', 'Test');
      status = degradationManager.getDegradationStatus();
      expect(status.ux.messaging.title).toContain('Read-Only Mode');
      expect(status.ux.messaging.limitations.length).toBeGreaterThan(0);
      
      // Level 4 - Monitoring only
      await degradationManager.degradeToLevel('LEVEL_4', 'Test');
      status = degradationManager.getDegradationStatus();
      expect(status.ux.messaging.title).toContain('System Monitoring');
      expect(status.ux.messaging.limitations.length).toBeGreaterThan(0);
    });
  });
  
  describe('Error Classification and Recovery', () => {
    test('should classify errors correctly', () => {
      const { ErrorClassifier } = require('../src/core/circuit-breaker-integration.js');
      
      const browserCrashError = new Error('Browser crashed unexpectedly');
      const memoryError = new Error('Out of memory');
      const networkError = new Error('Network timeout occurred');
      const validationError = new Error('Invalid parameter provided');
      
      expect(ErrorClassifier.classifyError(browserCrashError).type).toBe(ErrorType.BROWSER_CRASH);
      expect(ErrorClassifier.classifyError(memoryError).type).toBe(ErrorType.MEMORY_PRESSURE);
      expect(ErrorClassifier.classifyError(networkError).type).toBe(ErrorType.NETWORK_TIMEOUT);
      expect(ErrorClassifier.classifyError(validationError).type).toBe(ErrorType.VALIDATION_ERROR);
    });
  });
  
  describe('Performance and Metrics', () => {
    let degradationManager;
    
    beforeEach(() => {
      if (GracefulDegradationManager.instance) {
        GracefulDegradationManager.instance = null;
      }
      degradationManager = GracefulDegradationManager.getInstance();
    });
    
    test('should track time spent in each degradation level', async () => {
      const startTime = Date.now();
      
      await degradationManager.degradeToLevel('LEVEL_2', 'Test timing');
      
      // Wait a small amount to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const metrics = degradationManager.getDegradationMetrics();
      expect(metrics.timeInCurrentLevel).toBeGreaterThan(0);
      expect(metrics.timeInCurrentLevel).toBeLessThan(1000); // Should be very small for test
    });
    
    test('should provide performance impact metrics', () => {
      const metrics = degradationManager.getDegradationMetrics();
      
      expect(metrics.performanceImpact).toHaveProperty('reliability');
      expect(metrics.performanceImpact).toHaveProperty('speed');
      expect(metrics.performanceImpact).toHaveProperty('functionality');
      
      expect(metrics.performanceImpact.reliability).toBeGreaterThan(0);
      expect(metrics.performanceImpact.reliability).toBeLessThanOrEqual(1);
    });
    
    test('should export degradation data for analysis', async () => {
      const fs = require('fs');
      fs.promises.writeFile = jest.fn();
      
      const exportPath = await degradationManager.exportDegradationData();
      
      expect(exportPath).toContain('degradation-analysis-');
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });
  
  describe('Integration with Circuit Breaker and Connection Pooling', () => {
    test('should handle circuit breaker state changes', async () => {
      const degradationManager = GracefulDegradationManager.getInstance();
      const initialLevel = degradationManager.getCurrentLevel();
      
      // Simulate circuit breaker opening
      await degradationManager.handleCircuitBreakerEvent(
        'browser_navigate',
        'OPEN',
        new Error('Service failure')
      );
      
      const newLevel = degradationManager.getCurrentLevel();
      expect(newLevel).not.toBe(initialLevel);
    });
  });
});

describe('Integration Tests', () => {
  test('should work end-to-end with all components', async () => {
    const degradationManager = GracefulDegradationManager.getInstance();
    const integration = GracefulDegradationIntegration.getInstance();
    
    // Start at full functionality
    expect(degradationManager.getCurrentLevel()).toBe('LEVEL_1');
    
    // Simulate a failure that triggers degradation
    await degradationManager.handleCircuitBreakerEvent(
      'browser_click',
      'OPEN',
      new Error('Multiple click failures')
    );
    
    // Should have degraded
    expect(degradationManager.getCurrentLevel()).not.toBe('LEVEL_1');
    
    // Should be able to get system status
    const status = integration.getSystemStatus();
    expect(status.degradationLevel).not.toBe('LEVEL_1');
    expect(status.availableTools.length).toBeGreaterThan(0);
    
    // Should be able to coordinate recovery
    const recoveryResult = await integration.coordinateRecovery();
    expect(recoveryResult).toHaveProperty('overallSuccess');
    expect(recoveryResult.coordinatedComponents.length).toBeGreaterThan(0);
  });
});

// Performance benchmarks
describe('Performance Benchmarks', () => {
  test('degradation operations should complete quickly', async () => {
    const degradationManager = GracefulDegradationManager.getInstance();
    
    const startTime = Date.now();
    await degradationManager.degradeToLevel('LEVEL_2', 'Performance test');
    const degradationTime = Date.now() - startTime;
    
    expect(degradationTime).toBeLessThan(100); // Should complete in <100ms
  });
  
  test('system status retrieval should be fast', () => {
    const integration = GracefulDegradationIntegration.getInstance();
    
    const startTime = Date.now();
    const status = integration.getSystemStatus();
    const statusTime = Date.now() - startTime;
    
    expect(statusTime).toBeLessThan(50); // Should complete in <50ms
    expect(status).toBeDefined();
  });
});