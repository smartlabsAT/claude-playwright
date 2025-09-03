#!/usr/bin/env node
/**
 * Phase 1: Tool Naming Revolution Test Suite
 * 
 * Tests the MCP tool naming and progressive loading system
 * to verify Claude will prefer mcp_ prefixed tools.
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const logTest = (testName, passed, details = '') => {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const color = passed ? 'green' : 'red';
  log(`${status} ${testName}${details ? ` - ${details}` : ''}`, color);
};

const logSection = (section) => {
  log(`\n${colors.bold}=== ${section} ===${colors.reset}`, 'blue');
};

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, testFn) {
  totalTests++;
  try {
    const result = testFn();
    if (result) {
      passedTests++;
      logTest(name, true);
    } else {
      failedTests++;
      logTest(name, false);
    }
  } catch (error) {
    failedTests++;
    logTest(name, false, `Exception: ${error.message}`);
  }
}

logSection('Phase 1: Tool Naming Revolution Tests');

// Test 1: Tool naming strategy classes can be imported
try {
  const toolClasses = require('../dist/index.cjs');
  
  if (toolClasses.ToolNamingStrategy && toolClasses.ProgressiveToolLoader) {
    logTest('Tool naming classes exported correctly', true);
  } else {
    logTest('Tool naming classes exported correctly', false);
    process.exit(1);
  }
} catch (error) {
  logTest('Tool naming classes import', false, error.message);
  process.exit(1);
}

const { ToolNamingStrategy, ProgressiveToolLoader } = require('../dist/index.cjs');

// Test 2: Tool naming strategy functionality
runTest('Tool naming strategy has correct mappings', () => {
  const allMappings = ToolNamingStrategy.getAllMappings();
  return allMappings.length > 20 && // Should have 20+ tool mappings
         allMappings.every(m => m.newName.startsWith('mcp_')) && // All have mcp_ prefix
         allMappings.every(m => m.enhancedDescription.includes('Primary MCP tool')); // Enhanced descriptions
});

runTest('Tool mapping categories are correct', () => {
  const stats = ToolNamingStrategy.getMigrationStats();
  return stats.coreTools > 0 && 
         stats.testingTools > 0 && 
         stats.debugTools > 0 &&
         stats.totalTools === stats.coreTools + stats.testingTools + stats.debugTools;
});

runTest('Progressive loading priorities are set', () => {
  const priority0 = ToolNamingStrategy.getMappingsByPriority(0); // Core tools
  const priority100 = ToolNamingStrategy.getMappingsByPriority(100); // Testing tools  
  const priority200 = ToolNamingStrategy.getMappingsByPriority(200); // Debug tools
  
  return priority0.length > 0 && priority100.length > 0 && priority200.length > 0;
});

runTest('Old tool names can be looked up', () => {
  const mapping = ToolNamingStrategy.getMappingForOldName('browser_click');
  return mapping && 
         mapping.newName === 'mcp_browser_click' &&
         mapping.category === 'core' &&
         mapping.loadPriority === 0;
});

runTest('New tool names can be looked up', () => {
  const mapping = ToolNamingStrategy.getMappingForNewName('mcp_browser_click');
  return mapping && 
         mapping.oldName === 'browser_click' &&
         mapping.enhancedDescription.includes('Primary MCP tool');
});

runTest('Deprecation messages are generated', () => {
  const message = ToolNamingStrategy.getDeprecationMessage('browser_click');
  return message.includes('DEPRECATED') &&
         message.includes('mcp_browser_click') &&
         message.includes('Support ends');
});

// Test 3: Progressive tool loader functionality
runTest('Progressive tool loader can be instantiated', () => {
  const loader = new ProgressiveToolLoader({
    enableProgressiveLoading: true,
    baseDelay: 1,
    loadingStages: [0, 100, 200],
    logLoading: false // Disable logging for test
  });
  
  const stats = loader.getLoadingStats();
  return stats.totalStages === 3 && stats.totalTools > 20;
});

runTest('Loading stages are properly organized', () => {
  const loader = new ProgressiveToolLoader({ logLoading: false });
  const stages = loader.getStageDetails();
  
  return stages.length === 3 &&
         stages[0].priority === 0 &&    // Core tools first
         stages[1].priority === 100 &&  // Testing tools second  
         stages[2].priority === 200 &&  // Debug tools last
         stages.every(s => s.toolCount > 0);
});

// Test 4: MCP server build verification
runTest('MCP server includes tool naming integration', () => {
  const fs = require('fs');
  const path = require('path');
  
  const serverPath = path.join(__dirname, '../dist/mcp/server.cjs');
  
  if (!fs.existsSync(serverPath)) {
    return false;
  }
  
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  const integrationChecks = [
    'ToolNamingStrategy',
    'ProgressiveToolLoader',
    'registerToolWithNaming',
    'initializeToolNaming',
    'mcp_toolnaming_status',
    '[ToolNaming]',
    'Tool naming revolution complete'
  ];
  
  return integrationChecks.every(check => serverCode.includes(check));
});

runTest('Server initialization includes tool naming', () => {
  const fs = require('fs');
  const path = require('path');
  
  const serverPath = path.join(__dirname, '../dist/mcp/server.cjs');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  return serverCode.includes('await initializeToolNaming()') &&
         serverCode.includes('Phase 1: Tool Naming Revolution ACTIVE');
});

// Test 5: Tool mapping completeness
runTest('All major browser tools are mapped', () => {
  const majorTools = [
    'browser_click', 'browser_type', 'browser_navigate', 'browser_snapshot',
    'browser_hover', 'browser_fill_form', 'browser_console_messages',
    'browser_session_restore', 'browser_save_test', 'browser_run_test'
  ];
  
  return majorTools.every(toolName => {
    const mapping = ToolNamingStrategy.getMappingForOldName(toolName);
    return mapping && mapping.newName.startsWith('mcp_');
  });
});

runTest('Enhanced descriptions include preference language', () => {
  const allMappings = ToolNamingStrategy.getAllMappings();
  const preferenceKeywords = [
    'Primary MCP tool',
    'Use this instead of',
    'enhanced reliability',
    'improved performance'
  ];
  
  return allMappings.every(mapping => 
    preferenceKeywords.some(keyword => 
      mapping.enhancedDescription.includes(keyword)
    )
  );
});

// Test 6: Tool categories and priorities
runTest('Core tools have immediate loading priority', () => {
  const coreTools = ToolNamingStrategy.getAllMappings().filter(m => m.category === 'core');
  return coreTools.every(tool => tool.loadPriority === 0);
});

runTest('Testing tools have delayed loading priority', () => {
  const testingTools = ToolNamingStrategy.getAllMappings().filter(m => m.category === 'testing');
  return testingTools.every(tool => tool.loadPriority === 100);
});

runTest('Debug tools have maximum delay priority', () => {
  const debugTools = ToolNamingStrategy.getAllMappings().filter(m => m.category === 'debug');
  return debugTools.every(tool => tool.loadPriority === 200);
});

// Test 7: Migration strategy validation
runTest('Tool names follow mcp_ prefix convention', () => {
  const allMappings = ToolNamingStrategy.getAllMappings();
  const validPrefixes = ['mcp_browser_', 'mcp_session_', 'mcp_test_', 'mcp_debug_', 'mcp_cache_', 'mcp_protocol_', 'mcp_toolnaming_'];
  
  return allMappings.every(mapping => 
    validPrefixes.some(prefix => mapping.newName.startsWith(prefix))
  );
});

runTest('Tool names are concise and under 64 characters', () => {
  const allMappings = ToolNamingStrategy.getAllMappings();
  return allMappings.every(mapping => mapping.newName.length <= 64);
});

// Test 8: Configuration and customization
runTest('Progressive loader accepts custom configuration', () => {
  const customLoader = new ProgressiveToolLoader({
    enableProgressiveLoading: false,
    baseDelay: 5,
    loadingStages: [0],
    maxConcurrentLoads: 10,
    logLoading: false
  });
  
  return !customLoader.isLoadingComplete(); // Should not auto-complete
});

// Final Results
logSection('Test Results Summary');

const successRate = (passedTests / totalTests * 100).toFixed(1);
const color = passedTests === totalTests ? 'green' : 
              successRate >= 80 ? 'yellow' : 'red';

log(`\nTotal Tests: ${totalTests}`, 'blue');
log(`Passed: ${passedTests}`, 'green');  
log(`Failed: ${failedTests}`, 'red');
log(`Success Rate: ${successRate}%`, color);

if (passedTests === totalTests) {
  log('\n🎉 All Phase 1 Tool Naming Revolution tests passed!', 'green');
  log('✅ Tool naming strategy working correctly', 'green');
  log('✅ Progressive loading system ready', 'green');
  log('✅ MCP server integration verified', 'green');
  log('✅ Enhanced descriptions with preference language active', 'green');
  log('✅ mcp_ prefix system operational', 'green');
  
  logSection('Phase 1 Implementation Summary');
  
  const stats = ToolNamingStrategy.getMigrationStats();
  log(`📊 Total Tools: ${stats.totalTools}`, 'blue');
  log(`🔧 Core Tools: ${stats.coreTools} (immediate load)`, 'blue');
  log(`🧪 Testing Tools: ${stats.testingTools} (100ms delay)`, 'blue');
  log(`🐛 Debug Tools: ${stats.debugTools} (200ms delay)`, 'blue');
  
  log('\n🎯 Expected Impact:', 'yellow');
  log('• Claude should now prefer mcp_ prefixed tools over built-ins', 'yellow');
  log('• Enhanced tool descriptions signal preference and capabilities', 'yellow');  
  log('• Progressive loading prevents Claude tool-choice overload', 'yellow');
  log('• 30-day migration period with deprecation warnings', 'yellow');
  
  log('\n📋 Testing Instructions:', 'blue');
  log('1. Start MCP server: npx tsx src/mcp/server.ts', 'blue');
  log('2. Connect from Claude Code', 'blue');
  log('3. Use mcp_toolnaming_status tool to verify loading', 'blue');
  log('4. Test tool selection: "Click the login button"', 'blue');
  log('5. Monitor console for "[ToolNaming] ✅ NEW TOOL CALLED" messages', 'blue');
  
  log('\n🟢 Ready for Phase 2: Circuit Breaker Implementation', 'green');
  process.exit(0);
  
} else {
  log(`\n❌ ${failedTests} tests failed. Phase 1 implementation needs fixes.`, 'red');
  process.exit(1);
}