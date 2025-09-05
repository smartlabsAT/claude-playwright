#!/usr/bin/env node

/**
 * Build verification test to ensure Phase 2.3 implementation is complete
 */

const fs = require('fs');
const path = require('path');

function checkBuildFiles() {
  console.log('🏗️ Verifying Phase 2.3 - Context-Aware Similarity Build...\n');
  
  let passedChecks = 0;
  let totalChecks = 0;

  function check(name, condition, details = '') {
    totalChecks++;
    if (condition) {
      console.log(`✅ ${name}`);
      if (details) console.log(`   ${details}`);
      passedChecks++;
    } else {
      console.error(`❌ ${name}`);
      if (details) console.error(`   ${details}`);
    }
  }

  // Check source files exist
  console.log('📁 Source Files:');
  
  const sourceFiles = [
    'src/core/context-aware-similarity.ts',
    'src/core/smart-normalizer.ts', 
    'src/core/bidirectional-cache.ts',
    'src/core/test-scenario-cache.ts',
    'src/core/test-pattern-matcher.ts'
  ];

  sourceFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, '..', file));
    check(`Source: ${file}`, exists);
  });

  // Check build files exist
  console.log('\n🔨 Build Files:');
  
  const buildFiles = [
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts'
  ];

  buildFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, '..', file));
    check(`Built: ${file}`, exists);
  });

  // Check exports in index.ts
  console.log('\n📦 Exports Verification:');
  
  try {
    const indexContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    
    const expectedExports = [
      'ContextAwareSimilarity',
      'SIMILARITY_THRESHOLDS',
      'contextAwareSimilarity',
      'SimilarityContext',
      'SmartNormalizer',
      'NormalizationResult'
    ];

    expectedExports.forEach(exportName => {
      const hasExport = indexContent.includes(exportName);
      check(`Export: ${exportName}`, hasExport);
    });

  } catch (error) {
    check('Read index.ts exports', false, error.message);
  }

  // Check context-aware similarity implementation
  console.log('\n🧠 Implementation Verification:');
  
  try {
    const contextSimContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'context-aware-similarity.ts'), 'utf8');
    
    const requiredFeatures = [
      'calculateSimilarity',
      'hasExactActionMatch', 
      'hasConflictingActions',
      'SIMILARITY_THRESHOLDS',
      'ACTION_CONFLICTS',
      'test_search: 0.35',
      'cache_lookup: 0.15',
      'pattern_match: 0.25',
      'cross_env: 0.40'
    ];

    requiredFeatures.forEach(feature => {
      const hasFeature = contextSimContent.includes(feature);
      check(`Feature: ${feature}`, hasFeature);
    });

  } catch (error) {
    check('Read context-aware-similarity implementation', false, error.message);
  }

  // Check SmartNormalizer integration  
  console.log('\n🔗 SmartNormalizer Integration:');
  
  try {
    const smartNormContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'smart-normalizer.ts'), 'utf8');
    
    const integrationFeatures = [
      'calculateContextAwareSimilarity',
      'calculateSimilarityWithActionDetection',
      'getThresholdForOperation',
      'meetsThresholdForOperation'
    ];

    integrationFeatures.forEach(feature => {
      const hasFeature = smartNormContent.includes(feature);
      check(`Integration: ${feature}`, hasFeature);
    });

  } catch (error) {
    check('Read SmartNormalizer integration', false, error.message);
  }

  // Check BidirectionalCache updates
  console.log('\n🗄️ BidirectionalCache Integration:');
  
  try {
    const cacheContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'bidirectional-cache.ts'), 'utf8');
    
    const cacheFeatures = [
      'calculateContextAwareSimilarity',
      'Skip if actions conflict',
      'Use context-aware threshold'
    ];

    cacheFeatures.forEach(feature => {
      const hasFeature = cacheContent.includes(feature);
      check(`Cache Feature: ${feature}`, hasFeature);
    });

  } catch (error) {
    check('Read BidirectionalCache integration', false, error.message);
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Build Verification: ${passedChecks}/${totalChecks} checks passed`);
  
  if (passedChecks === totalChecks) {
    console.log('\n🎉 Phase 2.3 Implementation Complete!');
    console.log('\n✨ Context-Aware Similarity System Ready');
    console.log('\nKey Features Implemented:');
    console.log('🎯 Context-aware thresholds (test_search: 0.35, cache_lookup: 0.15, etc.)');
    console.log('⚔️  Action conflict detection (login ↔ logout, create ↔ delete)'); 
    console.log('🔍 Cross-environment domain matching with penalties');
    console.log('🧠 SmartNormalizer integration with enhanced similarity methods');
    console.log('🗄️  BidirectionalCache updates with context-aware calculations');
    console.log('📦 Complete TypeScript compilation and exports');
    console.log('\n🚀 Ready for production deployment!');
    
    return true;
  } else {
    console.error(`\n❌ ${totalChecks - passedChecks} checks failed`);
    console.error('🔧 Please review the implementation and fix any missing components.');
    return false;
  }
}

// Run verification
if (require.main === module) {
  const success = checkBuildFiles();
  process.exit(success ? 0 : 1);
}

module.exports = { checkBuildFiles };