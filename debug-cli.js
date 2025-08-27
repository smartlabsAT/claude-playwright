#!/usr/bin/env node

console.log('🔍 CLI Debug Information:');
console.log('Current working directory:', process.cwd());
console.log('Script filename:', __filename);
console.log('require.main:', require.main && require.main.filename);
console.log('require.main === module:', require.main === module);

// Try to load the CLI module and check its structure
try {
    console.log('\n📦 Loading CLI module...');
    const cliModule = require('./dist/cli/index.js');
    console.log('CLI module keys:', Object.keys(cliModule));
    
    if (cliModule.program) {
        console.log('Program object found');
        
        // Check if we can access the command help manually
        console.log('\n📋 Manual command test:');
        
        // Set process.argv to simulate --help
        const originalArgv = process.argv;
        process.argv = ['node', 'claude-playwright', '--help'];
        
        try {
            // Import program and manually parse
            const { program } = cliModule;
            
            // Parse with custom arguments
            program.parseAsync(['node', 'claude-playwright', '--help'], { from: 'argv' })
                .then(() => {
                    console.log('Parse completed');
                })
                .catch(err => {
                    console.error('Parse error:', err.message);
                });
                
        } catch (error) {
            console.error('Manual test failed:', error.message);
        }
        
        process.argv = originalArgv;
    }
    
} catch (error) {
    console.error('Failed to load CLI module:', error.message);
}

console.log('\n🎯 Testing console output directly:');
console.log('This should appear in output');
console.error('This should appear in stderr');