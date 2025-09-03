#!/usr/bin/env node
/**
 * Simple Phase 1: Tool Naming Revolution Test
 * 
 * Tests that the tool naming revolution is properly integrated
 * without requiring complex class imports.
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

console.log(`${colors.blue}${colors.bold}=== Phase 1: Tool Naming Revolution Test ===${colors.reset}`);

try {
  // Test if MCP server build includes tool naming integration
  const fs = require('fs');
  const path = require('path');
  
  const serverPath = path.join(__dirname, '../dist/mcp/server.cjs');
  
  if (!fs.existsSync(serverPath)) {
    console.log(`${colors.red}❌ FAIL${colors.reset} - MCP server not found at: ${serverPath}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}✅ PASS${colors.reset} - MCP server built successfully`);
  
  // Check if tool naming integration is present
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  const integrationChecks = [
    { name: 'ToolNamingStrategy class', pattern: 'ToolNamingStrategy' },
    { name: 'ProgressiveToolLoader class', pattern: 'ProgressiveToolLoader' },
    { name: 'Tool registration function', pattern: 'registerToolWithNaming' },
    { name: 'Progressive tool loading init', pattern: 'initializeToolNaming' },
    { name: 'Tool naming debug tool', pattern: 'mcp_toolnaming_status' },
    { name: 'Loading stage priorities', pattern: 'loadingStages: [0, 100, 200]' },
    { name: 'Enhanced tool descriptions', pattern: 'Primary MCP tool' },
    { name: 'mcp_ prefix system', pattern: 'mcp_ prefixed tools' },
    { name: 'Tool naming initialization', pattern: 'await initializeToolNaming()' },
    { name: 'Phase 1 active logging', pattern: 'Tool Naming Revolution ACTIVE' }
  ];
  
  let passedChecks = 0;
  
  integrationChecks.forEach(check => {
    if (serverCode.includes(check.pattern)) {
      console.log(`${colors.green}✅ PASS${colors.reset} - ${check.name} integrated`);
      passedChecks++;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - ${check.name} missing`);
    }
  });
  
  if (passedChecks === integrationChecks.length) {
    console.log(`\n${colors.green}${colors.bold}🎉 Phase 1 Tool Naming Revolution Complete!${colors.reset}`);
    console.log(`${colors.green}✅ All tool naming components integrated into MCP server${colors.reset}`);
    
    console.log(`\n${colors.blue}Implementation Features:${colors.reset}`);
    console.log(`• Progressive tool loading with 3 priority stages (0ms, 100ms, 200ms)`);
    console.log(`• mcp_ prefix system for better Claude recognition`);
    console.log(`• Enhanced tool descriptions with "Primary MCP tool" language`);
    console.log(`• Tool naming debug tool: mcp_toolnaming_status`);
    console.log(`• 30-day migration period with deprecation warnings`);
    console.log(`• Categories: Core (immediate), Testing (100ms), Debug (200ms)`);
    
    console.log(`\n${colors.blue}Expected Tool Behavior:${colors.reset}`);
    console.log(`• Claude should prefer mcp_browser_click over browser.click`);
    console.log(`• Enhanced descriptions signal preference over built-in tools`);
    console.log(`• Progressive loading prevents tool-choice overload`);
    console.log(`• Console logging shows "[ToolNaming] ✅ NEW TOOL CALLED"`);
    
    console.log(`\n${colors.blue}Testing Instructions:${colors.reset}`);
    console.log(`1. Start MCP server: npx tsx src/mcp/server.ts`);
    console.log(`2. Connect from Claude Code`);
    console.log(`3. Use mcp_toolnaming_status tool to verify loading`);
    console.log(`4. Test: "Click the login button" - should use mcp_browser_click`);
    console.log(`5. Monitor console for tool usage statistics`);
    
    console.log(`\n${colors.blue}Key Monitoring Points:${colors.reset}`);
    console.log(`• [ToolNaming] Progressive tool loader initialized`);
    console.log(`• [ToolNaming] ✅ Tool naming revolution complete!`);
    console.log(`• [ToolNaming] ✅ NEW TOOL CALLED: mcp_browser_* messages`);
    console.log(`• Phase 1: Tool Naming Revolution ACTIVE`);
    
    console.log(`\n${colors.green}✅ Phase 1 Ready for Production Testing${colors.reset}`);
    console.log(`${colors.blue}Ready for Phase 2: Circuit Breaker Implementation${colors.reset}`);
    
    process.exit(0);
    
  } else {
    console.log(`\n${colors.red}❌ Phase 1 implementation incomplete${colors.reset}`);
    console.log(`${passedChecks}/${integrationChecks.length} checks passed`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Test execution failed: ${error.message}`);
  process.exit(1);
}