#!/usr/bin/env node
/**
 * Simple Protocol Validation Test
 * 
 * Basic validation tests for Phase 0 functionality
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

console.log(`${colors.blue}${colors.bold}=== Phase 0: Protocol Validation Tests ===${colors.reset}`);

// Test 1: Check if classes can be imported
try {
  // Try importing with require for CommonJS compatibility
  const protocolClasses = require('../dist/index.cjs');
  
  if (protocolClasses.DefaultMCPProtocolValidator && 
      protocolClasses.ProtocolValidationLayer && 
      protocolClasses.ProtocolErrorRecovery) {
    console.log(`${colors.green}✅ PASS${colors.reset} - All protocol validation classes exported correctly`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Missing protocol validation class exports`);
    process.exit(1);
  }
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Cannot import protocol validation classes: ${error.message}`);
  process.exit(1);
}

// Test 2: Basic validator functionality
try {
  const { DefaultMCPProtocolValidator, ProtocolError } = require('../dist/index.cjs');
  
  const validator = new DefaultMCPProtocolValidator();
  
  // Test valid message
  const validMessage = {
    jsonrpc: '2.0',
    method: 'test',
    id: '123'
  };
  
  const result = validator.validateMessage(validMessage);
  
  if (result.isValid && result.errors.length === 0) {
    console.log(`${colors.green}✅ PASS${colors.reset} - Validator correctly validates valid messages`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Validator failed to validate valid message`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Validator instantiation failed: ${error.message}`);
  process.exit(1);
}

// Test 3: Invalid message detection
try {
  const { DefaultMCPProtocolValidator } = require('../dist/index.cjs');
  
  const validator = new DefaultMCPProtocolValidator();
  
  // Test invalid message (missing jsonrpc)
  const invalidMessage = {
    method: 'test',
    id: '123'
  };
  
  const result = validator.validateMessage(invalidMessage);
  
  if (!result.isValid && result.errors.length > 0) {
    console.log(`${colors.green}✅ PASS${colors.reset} - Validator correctly detects invalid messages`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Validator failed to detect invalid message`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Invalid message test failed: ${error.message}`);
  process.exit(1);
}

// Test 4: Input sanitization
try {
  const { DefaultMCPProtocolValidator } = require('../dist/index.cjs');
  
  const validator = new DefaultMCPProtocolValidator();
  
  const dangerousInput = '<script>alert("xss")</script>Hello World';
  const sanitized = validator.sanitizeInput(dangerousInput);
  
  if (sanitized.sanitizedInput !== dangerousInput && 
      sanitized.sanitizationApplied.length > 0) {
    console.log(`${colors.green}✅ PASS${colors.reset} - Input sanitization working correctly`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Input sanitization not working`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Sanitization test failed: ${error.message}`);
  process.exit(1);
}

// Test 5: Validation layer instantiation
try {
  const { ProtocolValidationLayer } = require('../dist/index.cjs');
  
  const layer = new ProtocolValidationLayer({
    enabled: true,
    strictMode: false,
    sanitizeInputs: true,
    enableRecovery: true,
    maxRecoveryAttempts: 3
  });
  
  const stats = layer.getStats();
  
  if (typeof stats.totalMessages === 'number' && 
      typeof stats.successRate === 'number') {
    console.log(`${colors.green}✅ PASS${colors.reset} - Protocol validation layer instantiates correctly`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Validation layer stats not working`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Validation layer test failed: ${error.message}`);
  process.exit(1);
}

// Test 6: Error recovery instantiation
try {
  const { ProtocolErrorRecovery } = require('../dist/index.cjs');
  
  const recovery = new ProtocolErrorRecovery();
  
  if (recovery && typeof recovery.handleProtocolError === 'function') {
    console.log(`${colors.green}✅ PASS${colors.reset} - Protocol error recovery system ready`);
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Error recovery system not properly initialized`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Error recovery test failed: ${error.message}`);
  process.exit(1);
}

// Test 7: MCP server build verification
try {
  const fs = require('fs');
  const path = require('path');
  
  const serverPath = path.join(__dirname, '../dist/mcp/server.cjs');
  
  if (fs.existsSync(serverPath)) {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    
    if (serverCode.includes('ProtocolValidationLayer') && 
        serverCode.includes('protocol_validation_status') &&
        serverCode.includes('executeValidatedTool')) {
      console.log(`${colors.green}✅ PASS${colors.reset} - MCP server includes protocol validation integration`);
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - MCP server missing protocol validation integration`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.red}❌ FAIL${colors.reset} - MCP server not found at expected location`);
    process.exit(1);
  }
  
} catch (error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} - MCP server verification failed: ${error.message}`);
  process.exit(1);
}

console.log(`\n${colors.green}${colors.bold}🎉 All Phase 0 Protocol Validation tests passed!${colors.reset}`);
console.log(`${colors.green}✅ Protocol validation system is ready for integration${colors.reset}`);
console.log(`${colors.blue}📊 Ready to test with real MCP server...${colors.reset}\n`);

console.log(`${colors.yellow}Next steps:${colors.reset}`);
console.log(`1. Test MCP server with: npx tsx src/mcp/server.ts`);
console.log(`2. Use protocol_validation_status tool to verify operation`);
console.log(`3. Monitor validation statistics in real usage`);
console.log(`4. Proceed with Phase 1: Tool Naming Revolution\n`);

process.exit(0);