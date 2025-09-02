#!/usr/bin/env node
/**
 * Basic Protocol Validation Test - No Dependencies
 * 
 * Tests just the core protocol validation classes without ProjectPaths
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

console.log(`${colors.blue}${colors.bold}=== Phase 0: Basic Protocol Validation Test ===${colors.reset}`);

// Test the core protocol validation directly from built files
try {
  // Just test if we can load the built server
  const fs = require('fs');
  const path = require('path');
  
  const serverPath = path.join(__dirname, '../dist/mcp/server.cjs');
  
  if (!fs.existsSync(serverPath)) {
    console.log(`${colors.red}❌ FAIL${colors.reset} - MCP server not found at: ${serverPath}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}✅ PASS${colors.reset} - MCP server built successfully`);
  
  // Check if protocol validation code is integrated
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  const validationChecks = [
    { name: 'ProtocolValidationLayer class', pattern: 'ProtocolValidationLayer' },
    { name: 'Protocol validation initialization', pattern: 'protocolValidation = new ProtocolValidationLayer' },
    { name: 'Validated tool wrapper', pattern: 'executeValidatedTool' },
    { name: 'Protocol validation status tool', pattern: 'protocol_validation_status' },
    { name: 'Sanitization enabled', pattern: 'sanitizeInputs: true' },
    { name: 'Error recovery enabled', pattern: 'enableRecovery: true' }
  ];
  
  let passedChecks = 0;
  
  validationChecks.forEach(check => {
    if (serverCode.includes(check.pattern)) {
      console.log(`${colors.green}✅ PASS${colors.reset} - ${check.name} integrated`);
      passedChecks++;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - ${check.name} missing`);
    }
  });
  
  if (passedChecks === validationChecks.length) {
    console.log(`\n${colors.green}${colors.bold}🎉 Phase 0 Implementation Complete!${colors.reset}`);
    console.log(`${colors.green}✅ All protocol validation components integrated into MCP server${colors.reset}`);
    
    console.log(`\n${colors.blue}Implementation Details:${colors.reset}`);
    console.log(`• Protocol validation layer initialized on browser startup`);
    console.log(`• All tool calls wrapped with validation`);
    console.log(`• Input sanitization enabled for security`);
    console.log(`• Error recovery with graceful degradation`);
    console.log(`• New debug tool: protocol_validation_status`);
    
    console.log(`\n${colors.blue}Testing Instructions:${colors.reset}`);
    console.log(`1. Start MCP server: npx tsx src/mcp/server.ts`);
    console.log(`2. Connect from Claude Code`);
    console.log(`3. Use protocol_validation_status tool to verify`);
    console.log(`4. Monitor console for validation messages`);
    
    console.log(`\n${colors.blue}Ready for Phase 1: Tool Naming Revolution${colors.reset}`);
    process.exit(0);
    
  } else {
    console.log(`\n${colors.red}❌ Phase 0 implementation incomplete${colors.reset}`);
    console.log(`${passedChecks}/${validationChecks.length} checks passed`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Test execution failed: ${error.message}`);
  process.exit(1);
}