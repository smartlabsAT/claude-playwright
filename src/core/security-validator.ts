import { z } from "zod";
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';

/**
 * SecurityValidator provides enhanced input validation and sanitization
 * for MCP tools to prevent security vulnerabilities.
 */
export class SecurityValidator {

  /**
   * Validates JavaScript code for browser_evaluate tool
   * Blocks potentially dangerous operations while allowing safe ones
   */
  static readonly JavaScriptSchema = z.string()
    .min(1, "Script cannot be empty")
    .max(10000, "Script too long (max 10KB)")
    .refine(
      (script) => {
        // Block dangerous patterns
        const dangerousPatterns = [
          /document\.cookie/i,
          /window\.location\s*=/i,
          /eval\s*\(/i,
          /Function\s*\(/i,
          /setTimeout\s*\(/i,
          /setInterval\s*\(/i,
          /fetch\s*\(/i,
          /XMLHttpRequest/i,
          /while\s*\(\s*true\s*\)/i,
          /for\s*\(\s*;\s*;\s*\)/i,
          /\.innerHTML\s*=/i,
          /\.outerHTML\s*=/i,
          /javascript\s*:/i,
          /import\s*\(/i,
          /require\s*\(/i
        ];

        return !dangerousPatterns.some(pattern => pattern.test(script));
      },
      "Script contains potentially dangerous operations"
    );

  /**
   * Validates CSS selectors to prevent injection and performance issues
   */
  static readonly SelectorSchema = z.string()
    .min(1, "Selector cannot be empty")
    .max(500, "Selector too long")
    .refine(
      (selector) => {
        // Block dangerous patterns
        const dangerousPatterns = [
          /javascript\s*:/i,
          /expression\s*\(/i,
          /url\s*\(/i,
          /import\s*\(/i,
          /@import/i,
          /[\x00-\x1f]/g, // Control characters
        ];

        return !dangerousPatterns.some(pattern => pattern.test(selector));
      },
      "Selector contains dangerous patterns"
    )
    .refine(
      (selector) => {
        // Validate CSS selector syntax
        const validSelectorPattern = /^[a-zA-Z0-9\s\[\]='".:>#*+~(),-_-]+$/;
        return validSelectorPattern.test(selector);
      },
      "Selector contains invalid characters"
    )
    .refine(
      (selector) => {
        // Performance protection
        const complexityChecks = [
          selector.split(' ').length <= 10, // Max 10 parts
          (selector.match(/\*/g) || []).length <= 2, // Max 2 wildcards
          (selector.match(/:nth-child/g) || []).length <= 3 // Max 3 nth-childs
        ];

        return complexityChecks.every(check => check);
      },
      "Selector too complex (performance protection)"
    );

  /**
   * Validates session names to prevent path traversal
   */
  static readonly SessionNameSchema = z.string()
    .min(1, "Session name cannot be empty")
    .max(50, "Session name too long")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Session name can only contain letters, numbers, hyphens and underscores"
    )
    .refine(
      (name) => {
        // Prevent reserved system names
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        return !reservedNames.includes(name.toUpperCase());
      },
      "Session name is a reserved system name"
    );

  /**
   * Validates text input to prevent XSS and limit size
   */
  static readonly TextInputSchema = z.string()
    .max(50000, "Text input too long (max 50KB)")
    .refine(
      (text) => {
        // Basic XSS prevention - detect script tags and event handlers
        const xssPatterns = [
          /<script[\s\S]*?>/gi,
          /<iframe[\s\S]*?>/gi,
          /javascript\s*:/gi,
          /on\w+\s*=/gi, // onclick, onload, etc.
          /<object[\s\S]*?>/gi,
          /<embed[\s\S]*?>/gi
        ];

        return !xssPatterns.some(pattern => pattern.test(text));
      },
      "Text contains potentially harmful HTML/JavaScript"
    );

  /**
   * Validates URLs to ensure they use safe protocols
   */
  static readonly URLSchema = z.string()
    .url("Invalid URL format")
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
          return false;
        }
      },
      "Only HTTP/HTTPS protocols allowed"
    );

  /**
   * Validates keyboard keys for browser_press_key tool
   */
  static readonly KeyboardKeySchema = z.string()
    .min(1, "Key cannot be empty")
    .max(20, "Key name too long")
    .regex(
      /^[a-zA-Z0-9]+$|^(Enter|Tab|Escape|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace|Delete|Home|End|PageUp|PageDown|F[1-9]|F1[0-2]|Shift|Control|Alt|Meta)$/,
      "Invalid key name"
    );

  /**
   * Validates timeout values
   */
  static readonly TimeoutSchema = z.number()
    .min(0.1, "Timeout too short")
    .max(300, "Timeout too long (max 5 minutes)")
    .default(30);

  /**
   * Sanitizes text input by escaping HTML entities
   */
  static sanitizeTextInput(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Sanitizes CSS selectors by removing dangerous patterns
   */
  static sanitizeSelector(selector: string): string {
    return selector
      .replace(/javascript:/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/[\\]/g, '') // Remove backslashes
      .trim();
  }

  /**
   * Sanitizes file names for session management
   */
  static sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Validates and constructs safe session file path
   */
  static validateSessionPath(sessionName: string): string {
    const sessionsDir = ProjectPaths.getSessionsDir();
    const sessionPath = path.join(sessionsDir, `${sessionName}.session.json`);

    // Resolve paths to prevent traversal
    const resolvedPath = path.resolve(sessionPath);
    const resolvedDir = path.resolve(sessionsDir);

    if (!resolvedPath.startsWith(resolvedDir)) {
      throw new Error('Invalid session path - path traversal detected');
    }

    return resolvedPath;
  }

  /**
   * Wraps JavaScript code in try-catch for safer execution
   */
  static wrapJavaScriptForSafeExecution(script: string): string {
    return `
      try {
        ${script}
      } catch(e) {
        console.error('Script execution error:', e.message);
        return { error: e.message };
      }
    `;
  }
}