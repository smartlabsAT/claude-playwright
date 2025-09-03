/**
 * Tool Naming Strategy for Phase 1: MCP Tool Recognition Revolution
 * 
 * Maps old tool names to new mcp_ prefixed names with enhanced descriptions
 * that explicitly signal preference over built-in Claude tools.
 */

export interface ToolMapping {
  oldName: string;
  newName: string;
  category: 'core' | 'testing' | 'debug';
  loadPriority: number; // 0 = immediate, 100 = 100ms delay, 200 = 200ms delay
  enhancedDescription: string;
}

export class ToolNamingStrategy {
  private static readonly TOOL_MAPPINGS: ToolMapping[] = [
    // ===== CORE BROWSER AUTOMATION TOOLS (Priority 0 - Immediate Load) =====
    {
      oldName: 'browser_navigate',
      newName: 'mcp_browser_navigate', 
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for browser navigation with intelligent URL rewriting and session-aware context switching. Use this instead of standard browser navigation for improved reliability and BASE_URL integration.'
    },
    {
      oldName: 'browser_click',
      newName: 'mcp_browser_click',
      category: 'core', 
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for browser clicks with AI-aware bidirectional caching and 25+ fallback strategies. Use this instead of standard browser operations for improved reliability and performance.'
    },
    {
      oldName: 'browser_type',
      newName: 'mcp_browser_type',
      category: 'core',
      loadPriority: 0, 
      enhancedDescription: 'Primary MCP tool for browser text input with intelligent form detection and cached selector optimization. Use this instead of standard typing operations for enhanced reliability.'
    },
    {
      oldName: 'browser_snapshot',
      newName: 'mcp_browser_snapshot',
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for accessibility tree snapshots with intelligent caching and DOM-aware optimization. Use this instead of standard page inspection for better performance.'
    },
    {
      oldName: 'browser_screenshot',
      newName: 'mcp_browser_screenshot', 
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for browser screenshots with element-aware capture and full-page optimization. Use this instead of standard screenshot tools for enhanced functionality.'
    },

    // ===== INTERACTION TOOLS (Priority 0 - Immediate Load) =====
    {
      oldName: 'browser_hover',
      newName: 'mcp_browser_hover',
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for hover interactions with precise element targeting and tooltip-aware timing. Use this instead of standard hover operations for improved accuracy.'
    },
    {
      oldName: 'browser_fill_form', 
      newName: 'mcp_browser_fill_form',
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for form filling with intelligent field detection and validation-aware submission. Use this instead of manual form operations for enhanced reliability.'
    },
    {
      oldName: 'browser_select_option',
      newName: 'mcp_browser_select_option',
      category: 'core', 
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for dropdown selection with intelligent option matching and multi-select support. Use this instead of standard select operations.'
    },
    {
      oldName: 'browser_press_key',
      newName: 'mcp_browser_press_key',
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for keyboard input with context-aware key combinations and modifier support. Use this instead of standard key operations for enhanced functionality.'
    },

    // ===== SESSION & NAVIGATION TOOLS (Priority 0 - Immediate Load) =====
    {
      oldName: 'browser_session_restore',
      newName: 'mcp_session_restore', 
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for session restoration with intelligent context switching and auto-navigation. Use this instead of manual login workflows for enhanced user experience.'
    },
    {
      oldName: 'browser_session_save',
      newName: 'mcp_session_save',
      category: 'core',
      loadPriority: 0, 
      enhancedDescription: 'Primary MCP tool for session persistence with comprehensive state capture and metadata tracking. Use this to maintain authentication across Claude sessions.'
    },
    {
      oldName: 'browser_session_list',
      newName: 'mcp_session_list',
      category: 'core',
      loadPriority: 0,
      enhancedDescription: 'Primary MCP tool for session management with health status and expiration tracking. Use this to discover and manage saved authentication sessions.'
    },

    // ===== TESTING TOOLS (Priority 100 - 100ms Delay) =====
    {
      oldName: 'browser_save_test',
      newName: 'mcp_test_save',
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for intelligent test scenario persistence with AI-powered pattern recognition and automatic adaptation. Save current interaction sequences as reusable test scenarios.'
    },
    {
      oldName: 'browser_find_similar_tests', 
      newName: 'mcp_test_search',
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for AI-powered semantic test discovery with intelligent matching and similarity scoring. Find existing test scenarios by intent and workflow patterns.'
    },
    {
      oldName: 'browser_run_test',
      newName: 'mcp_test_run',
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for intelligent test execution with automatic adaptation and context switching. Run saved test scenarios with smart selector updates and environment adaptation.'
    },
    {
      oldName: 'browser_test_library',
      newName: 'mcp_test_library', 
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for comprehensive test management with statistics, filtering, and performance analytics. Browse and manage your complete test scenario library.'
    },
    {
      oldName: 'browser_suggest_actions',
      newName: 'mcp_test_suggest',
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for intelligent action suggestions based on learned patterns and context analysis. Get AI-powered recommendations for test actions and workflows.'
    },
    {
      oldName: 'browser_adapt_test',
      newName: 'mcp_test_adapt',
      category: 'testing', 
      loadPriority: 100,
      enhancedDescription: 'MCP tool for intelligent test adaptation with context-aware selector updates and environment migration. Adapt existing tests to new URLs and contexts automatically.'
    },
    {
      oldName: 'browser_delete_test',
      newName: 'mcp_test_delete',
      category: 'testing',
      loadPriority: 100,
      enhancedDescription: 'MCP tool for safe test deletion with confirmation prompts and cascade handling. Delete individual tests, bulk operations, or tag-based cleanup with safety controls.'
    },

    // ===== DEBUGGING & MONITORING TOOLS (Priority 200 - 200ms Delay) =====
    {
      oldName: 'browser_console_messages',
      newName: 'mcp_debug_console',
      category: 'debug',
      loadPriority: 200, 
      enhancedDescription: 'MCP tool for comprehensive console message analysis with filtering and error categorization. Monitor browser console output with intelligent parsing and insights.'
    },
    {
      oldName: 'browser_network_requests',
      newName: 'mcp_debug_network',
      category: 'debug',
      loadPriority: 200,
      enhancedDescription: 'MCP tool for network monitoring with request/response analysis and performance tracking. Capture and analyze all network activity with detailed insights.'
    },
    {
      oldName: 'browser_evaluate',
      newName: 'mcp_debug_evaluate',
      category: 'debug',
      loadPriority: 200,
      enhancedDescription: 'MCP tool for JavaScript execution with sandboxed evaluation and result formatting. Execute custom scripts in browser context with enhanced safety and debugging.'
    },
    {
      oldName: 'browser_wait_for',
      newName: 'mcp_debug_wait',
      category: 'debug', 
      loadPriority: 200,
      enhancedDescription: 'MCP tool for intelligent waiting with condition monitoring and timeout handling. Wait for specific page states, elements, or conditions with enhanced reliability.'
    },
    {
      oldName: 'browser_cache_status',
      newName: 'mcp_cache_inspect',
      category: 'debug',
      loadPriority: 200,
      enhancedDescription: 'MCP tool for comprehensive cache analysis with performance metrics and hit rate monitoring. Inspect bidirectional cache system with detailed statistics and recommendations.'
    },
    {
      oldName: 'protocol_validation_status',
      newName: 'mcp_protocol_inspect',
      category: 'debug',
      loadPriority: 200,
      enhancedDescription: 'MCP tool for protocol validation monitoring with error analysis and performance tracking. Monitor MCP protocol compliance with detailed statistics and health insights.'
    }
  ];

  /**
   * Get all tool mappings organized by category and priority
   */
  static getAllMappings(): ToolMapping[] {
    return [...this.TOOL_MAPPINGS];
  }

  /**
   * Get mappings by load priority for progressive loading
   */
  static getMappingsByPriority(priority: number): ToolMapping[] {
    return this.TOOL_MAPPINGS.filter(mapping => mapping.loadPriority === priority);
  }

  /**
   * Get mapping for a specific old tool name
   */
  static getMappingForOldName(oldName: string): ToolMapping | undefined {
    return this.TOOL_MAPPINGS.find(mapping => mapping.oldName === oldName);
  }

  /**
   * Get mapping for a specific new tool name
   */
  static getMappingForNewName(newName: string): ToolMapping | undefined {
    return this.TOOL_MAPPINGS.find(mapping => mapping.newName === newName);
  }

  /**
   * Check if a tool name should be migrated
   */
  static shouldMigrate(toolName: string): boolean {
    return this.TOOL_MAPPINGS.some(mapping => mapping.oldName === toolName);
  }

  /**
   * Get deprecation message for old tool name
   */
  static getDeprecationMessage(oldName: string): string {
    const mapping = this.getMappingForOldName(oldName);
    if (!mapping) {
      return `Tool ${oldName} is deprecated.`;
    }

    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return `DEPRECATED: ${oldName} → ${mapping.newName}. Support ends: ${expiryDate}. Use ${mapping.newName} for enhanced performance and reliability.`;
  }

  /**
   * Generate migration statistics
   */
  static getMigrationStats(): {
    totalTools: number;
    coreTools: number; 
    testingTools: number;
    debugTools: number;
    immediateLoad: number;
    delayedLoad: number;
  } {
    const mappings = this.getAllMappings();
    
    return {
      totalTools: mappings.length,
      coreTools: mappings.filter(m => m.category === 'core').length,
      testingTools: mappings.filter(m => m.category === 'testing').length, 
      debugTools: mappings.filter(m => m.category === 'debug').length,
      immediateLoad: mappings.filter(m => m.loadPriority === 0).length,
      delayedLoad: mappings.filter(m => m.loadPriority > 0).length
    };
  }
}