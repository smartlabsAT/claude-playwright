/**
 * Progressive Tool Loader for Phase 1: Tool Naming Revolution
 * 
 * Implements staged tool loading to prevent Claude from being overwhelmed
 * by too many tool choices at once, improving tool selection reliability.
 */

import { ToolNamingStrategy, ToolMapping } from './tool-naming-strategy.js';

export interface LoadingStage {
  priority: number;
  delay: number;
  tools: ToolMapping[];
  loaded: boolean;
  loadTime?: number;
}

export interface ProgressiveLoadingConfig {
  enableProgressiveLoading: boolean;
  baseDelay: number;           // Base delay multiplier (default: 1)
  loadingStages: number[];     // Priorities to load (default: [0, 100, 200])
  maxConcurrentLoads: number;  // Max tools to load simultaneously
  logLoading: boolean;         // Log loading progress
}

export class ProgressiveToolLoader {
  private config: ProgressiveLoadingConfig;
  private loadingStages: Map<number, LoadingStage> = new Map();
  private totalToolsLoaded = 0;
  private startTime = 0;

  constructor(config: Partial<ProgressiveLoadingConfig> = {}) {
    this.config = {
      enableProgressiveLoading: true,
      baseDelay: 1,
      loadingStages: [0, 100, 200],
      maxConcurrentLoads: 5,
      logLoading: true,
      ...config
    };

    this.initializeStages();
  }

  /**
   * Initialize loading stages based on configuration
   */
  private initializeStages(): void {
    this.config.loadingStages.forEach(priority => {
      const tools = ToolNamingStrategy.getMappingsByPriority(priority);
      
      this.loadingStages.set(priority, {
        priority,
        delay: priority * this.config.baseDelay,
        tools,
        loaded: false
      });
    });

    if (this.config.logLoading) {
      const stats = this.getLoadingStats();
      console.error(`[ProgressiveToolLoader] Initialized ${stats.totalStages} loading stages with ${stats.totalTools} tools`);
      
      this.loadingStages.forEach((stage, priority) => {
        console.error(`[ProgressiveToolLoader] Stage ${priority}: ${stage.tools.length} tools (${stage.delay}ms delay)`);
      });
    }
  }

  /**
   * Start progressive loading process
   */
  async startLoading(toolRegistrationCallback: (mapping: ToolMapping, isNew: boolean) => Promise<void>): Promise<void> {
    if (!this.config.enableProgressiveLoading) {
      console.error('[ProgressiveToolLoader] Progressive loading disabled, loading all tools immediately');
      await this.loadAllToolsImmediately(toolRegistrationCallback);
      return;
    }

    this.startTime = Date.now();
    console.error('[ProgressiveToolLoader] Starting progressive tool loading...');

    // Load stages in order
    const sortedStages = Array.from(this.loadingStages.entries()).sort(([a], [b]) => a - b);

    for (const [priority, stage] of sortedStages) {
      if (stage.delay > 0) {
        console.error(`[ProgressiveToolLoader] Waiting ${stage.delay}ms before loading stage ${priority}...`);
        await this.sleep(stage.delay);
      }

      await this.loadStage(stage, toolRegistrationCallback);
    }

    const totalTime = Date.now() - this.startTime;
    const stats = this.getLoadingStats();
    
    console.error(`[ProgressiveToolLoader] ✅ Progressive loading complete in ${totalTime}ms`);
    console.error(`[ProgressiveToolLoader] Loaded ${stats.totalTools} tools across ${stats.totalStages} stages`);
  }

  /**
   * Load a specific stage
   */
  private async loadStage(stage: LoadingStage, registrationCallback: (mapping: ToolMapping, isNew: boolean) => Promise<void>): Promise<void> {
    const stageStartTime = Date.now();
    
    console.error(`[ProgressiveToolLoader] Loading stage ${stage.priority} (${stage.tools.length} tools)...`);

    // Load tools in batches to prevent overwhelming the system
    const batches = this.chunkArray(stage.tools, this.config.maxConcurrentLoads);

    for (const batch of batches) {
      const loadPromises = batch.map(async (mapping) => {
        try {
          await registrationCallback(mapping, true); // isNew = true for new mcp_ tools
          this.totalToolsLoaded++;
          
          if (this.config.logLoading) {
            console.error(`[ProgressiveToolLoader] ✅ Registered ${mapping.newName} (${mapping.category})`);
          }
        } catch (error) {
          console.error(`[ProgressiveToolLoader] ❌ Failed to register ${mapping.newName}:`, error);
        }
      });

      await Promise.all(loadPromises);
    }

    const stageTime = Date.now() - stageStartTime;
    stage.loaded = true;
    stage.loadTime = stageTime;

    console.error(`[ProgressiveToolLoader] ✅ Stage ${stage.priority} loaded in ${stageTime}ms`);
  }

  /**
   * Fallback: Load all tools immediately if progressive loading is disabled
   */
  private async loadAllToolsImmediately(registrationCallback: (mapping: ToolMapping, isNew: boolean) => Promise<void>): Promise<void> {
    const allMappings = ToolNamingStrategy.getAllMappings();
    console.error(`[ProgressiveToolLoader] Loading ${allMappings.length} tools immediately...`);

    for (const mapping of allMappings) {
      try {
        await registrationCallback(mapping, true);
        this.totalToolsLoaded++;
      } catch (error) {
        console.error(`[ProgressiveToolLoader] Failed to register ${mapping.newName}:`, error);
      }
    }
  }

  /**
   * Register legacy tools with deprecation warnings
   */
  async registerLegacyTools(registrationCallback: (mapping: ToolMapping, isNew: boolean) => Promise<void>): Promise<void> {
    const allMappings = ToolNamingStrategy.getAllMappings();
    console.error(`[ProgressiveToolLoader] Registering ${allMappings.length} legacy tools with deprecation warnings...`);

    for (const mapping of allMappings) {
      try {
        await registrationCallback(mapping, false); // isNew = false for legacy tools
        
        if (this.config.logLoading) {
          console.error(`[ProgressiveToolLoader] ⚠️ Legacy ${mapping.oldName} → forwards to ${mapping.newName}`);
        }
      } catch (error) {
        console.error(`[ProgressiveToolLoader] Failed to register legacy ${mapping.oldName}:`, error);
      }
    }
  }

  /**
   * Get loading statistics
   */
  getLoadingStats(): {
    totalStages: number;
    totalTools: number;
    loadedStages: number;
    loadedTools: number;
    completionPercentage: number;
    totalTime: number;
  } {
    const loadedStages = Array.from(this.loadingStages.values()).filter(s => s.loaded).length;
    const totalTools = Array.from(this.loadingStages.values()).reduce((sum, s) => sum + s.tools.length, 0);
    
    return {
      totalStages: this.loadingStages.size,
      totalTools,
      loadedStages,
      loadedTools: this.totalToolsLoaded,
      completionPercentage: totalTools > 0 ? (this.totalToolsLoaded / totalTools) * 100 : 0,
      totalTime: this.startTime > 0 ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Get detailed stage information
   */
  getStageDetails(): { priority: number; loaded: boolean; toolCount: number; loadTime?: number }[] {
    return Array.from(this.loadingStages.entries())
      .sort(([a], [b]) => a - b)
      .map(([priority, stage]) => ({
        priority,
        loaded: stage.loaded,
        toolCount: stage.tools.length,
        loadTime: stage.loadTime
      }));
  }

  /**
   * Check if loading is complete
   */
  isLoadingComplete(): boolean {
    return Array.from(this.loadingStages.values()).every(stage => stage.loaded);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProgressiveLoadingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.loadingStages) {
      this.loadingStages.clear();
      this.initializeStages();
    }

    console.error('[ProgressiveToolLoader] Configuration updated:', this.config);
  }

  // Utility methods

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}