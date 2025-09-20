/**
 * Test file for SecurityValidator
 * Tests input validation and sanitization functionality
 */

import { SecurityValidator } from '../src/core/security-validator.ts';

async function runSecurityValidatorTests() {
  console.log('🔒 Running SecurityValidator Tests...\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  // JavaScript Validation Tests
  console.log('📝 JavaScript Schema Tests:');

  test('Should accept safe JavaScript code', () => {
    const safeScript = 'document.querySelector("#test").textContent';
    const result = SecurityValidator.JavaScriptSchema.safeParse(safeScript);
    if (!result.success) throw new Error('Safe script rejected');
  });

  test('Should reject dangerous JavaScript - document.cookie', () => {
    const dangerousScript = 'document.cookie = "evil=true"';
    const result = SecurityValidator.JavaScriptSchema.safeParse(dangerousScript);
    if (result.success) throw new Error('Dangerous script accepted');
  });

  test('Should reject dangerous JavaScript - window.location', () => {
    const dangerousScript = 'window.location = "https://evil.com"';
    const result = SecurityValidator.JavaScriptSchema.safeParse(dangerousScript);
    if (result.success) throw new Error('Dangerous script accepted');
  });

  test('Should reject dangerous JavaScript - eval', () => {
    const dangerousScript = 'eval("alert(1)")';
    const result = SecurityValidator.JavaScriptSchema.safeParse(dangerousScript);
    if (result.success) throw new Error('Dangerous script accepted');
  });

  test('Should reject too long JavaScript', () => {
    const longScript = 'a'.repeat(15000);
    const result = SecurityValidator.JavaScriptSchema.safeParse(longScript);
    if (result.success) throw new Error('Too long script accepted');
  });

  // CSS Selector Validation Tests
  console.log('\n🎯 CSS Selector Schema Tests:');

  test('Should accept valid CSS selector', () => {
    const validSelector = 'button.submit-btn:first-child';
    const result = SecurityValidator.SelectorSchema.safeParse(validSelector);
    if (!result.success) throw new Error('Valid selector rejected');
  });

  test('Should reject dangerous CSS selector - javascript:', () => {
    const dangerousSelector = 'a[href="javascript:alert(1)"]';
    const result = SecurityValidator.SelectorSchema.safeParse(dangerousSelector);
    if (result.success) throw new Error('Dangerous selector accepted');
  });

  test('Should reject too complex CSS selector', () => {
    const complexSelector = 'a b c d e f g h i j k l'; // More than 10 parts
    const result = SecurityValidator.SelectorSchema.safeParse(complexSelector);
    if (result.success) throw new Error('Too complex selector accepted');
  });

  test('Should reject too many wildcards', () => {
    const wildcardSelector = '* * *'; // More than 2 wildcards
    const result = SecurityValidator.SelectorSchema.safeParse(wildcardSelector);
    if (result.success) throw new Error('Too many wildcards accepted');
  });

  // Session Name Validation Tests
  console.log('\n👤 Session Name Schema Tests:');

  test('Should accept valid session name', () => {
    const validName = 'test-user_123';
    const result = SecurityValidator.SessionNameSchema.safeParse(validName);
    if (!result.success) throw new Error('Valid session name rejected');
  });

  test('Should reject session name with path traversal', () => {
    const dangerousName = '../../../etc/passwd';
    const result = SecurityValidator.SessionNameSchema.safeParse(dangerousName);
    if (result.success) throw new Error('Path traversal accepted');
  });

  test('Should reject reserved system name', () => {
    const reservedName = 'CON';
    const result = SecurityValidator.SessionNameSchema.safeParse(reservedName);
    if (result.success) throw new Error('Reserved name accepted');
  });

  test('Should reject too long session name', () => {
    const longName = 'a'.repeat(100);
    const result = SecurityValidator.SessionNameSchema.safeParse(longName);
    if (result.success) throw new Error('Too long name accepted');
  });

  // Text Input Validation Tests
  console.log('\n📝 Text Input Schema Tests:');

  test('Should accept normal text input', () => {
    const normalText = 'Hello World! This is normal text.';
    const result = SecurityValidator.TextInputSchema.safeParse(normalText);
    if (!result.success) throw new Error('Normal text rejected');
  });

  test('Should reject XSS script tag', () => {
    const xssText = '<script>alert("XSS")</script>';
    const result = SecurityValidator.TextInputSchema.safeParse(xssText);
    if (result.success) throw new Error('XSS script accepted');
  });

  test('Should reject XSS event handler', () => {
    const xssText = '<img src=x onerror="alert(1)">';
    const result = SecurityValidator.TextInputSchema.safeParse(xssText);
    if (result.success) throw new Error('XSS event handler accepted');
  });

  test('Should reject too long text input', () => {
    const longText = 'a'.repeat(60000);
    const result = SecurityValidator.TextInputSchema.safeParse(longText);
    if (result.success) throw new Error('Too long text accepted');
  });

  // URL Validation Tests
  console.log('\n🌐 URL Schema Tests:');

  test('Should accept valid HTTP URL', () => {
    const validUrl = 'http://example.com/test';
    const result = SecurityValidator.URLSchema.safeParse(validUrl);
    if (!result.success) throw new Error('Valid HTTP URL rejected');
  });

  test('Should accept valid HTTPS URL', () => {
    const validUrl = 'https://example.com/test';
    const result = SecurityValidator.URLSchema.safeParse(validUrl);
    if (!result.success) throw new Error('Valid HTTPS URL rejected');
  });

  test('Should reject non-HTTP protocol', () => {
    const dangerousUrl = 'file:///etc/passwd';
    const result = SecurityValidator.URLSchema.safeParse(dangerousUrl);
    if (result.success) throw new Error('File protocol accepted');
  });

  test('Should reject invalid URL format', () => {
    const invalidUrl = 'not-a-url';
    const result = SecurityValidator.URLSchema.safeParse(invalidUrl);
    if (result.success) throw new Error('Invalid URL accepted');
  });

  // Keyboard Key Validation Tests
  console.log('\n⌨️ Keyboard Key Schema Tests:');

  test('Should accept valid key name', () => {
    const validKey = 'Enter';
    const result = SecurityValidator.KeyboardKeySchema.safeParse(validKey);
    if (!result.success) throw new Error('Valid key rejected');
  });

  test('Should accept alphanumeric key', () => {
    const validKey = 'a';
    const result = SecurityValidator.KeyboardKeySchema.safeParse(validKey);
    if (!result.success) throw new Error('Alphanumeric key rejected');
  });

  test('Should reject invalid key name', () => {
    const invalidKey = 'InvalidKey!@#';
    const result = SecurityValidator.KeyboardKeySchema.safeParse(invalidKey);
    if (result.success) throw new Error('Invalid key accepted');
  });

  // Sanitization Function Tests
  console.log('\n🧽 Sanitization Function Tests:');

  test('Should sanitize HTML entities in text', () => {
    const unsafeText = '<script>alert("XSS")</script>';
    const sanitized = SecurityValidator.sanitizeTextInput(unsafeText);
    if (sanitized.includes('<script>')) throw new Error('Script tag not sanitized');
  });

  test('Should sanitize CSS selector', () => {
    const unsafeSelector = 'button\\javascript:alert(1)';
    const sanitized = SecurityValidator.sanitizeSelector(unsafeSelector);
    if (sanitized.includes('javascript:') || sanitized.includes('\\')) {
      throw new Error('Dangerous patterns not removed');
    }
  });

  test('Should sanitize file name', () => {
    const unsafeFileName = '../../../evil.txt';
    const sanitized = SecurityValidator.sanitizeFileName(unsafeFileName);
    if (sanitized.includes('/') || sanitized.includes('.')) {
      throw new Error('Path characters not sanitized');
    }
  });

  // Summary
  console.log(`\n📊 Test Summary:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

// Run tests
runSecurityValidatorTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});