/**
 * Safe JSON parsing utilities to prevent crashes from malformed JSON
 */

/**
 * Safely parse JSON with fallback value
 * @param json - JSON string to parse
 * @param fallback - Value to return if parsing fails
 * @param context - Optional context for error logging
 * @returns Parsed JSON or fallback value
 */
export function safeJSONParse<T>(json: string, fallback: T, context?: string): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    const contextMessage = context ? ` [Context: ${context}]` : '';
    console.error(`[SafeJSON] Parse error${contextMessage}:`, error);
    return fallback;
  }
}

/**
 * Safely stringify JSON with error handling
 * @param value - Value to stringify
 * @param replacer - Optional replacer function
 * @param space - Optional spacing
 * @returns JSON string or empty string on error
 */
export function safeJSONStringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number
): string {
  try {
    return JSON.stringify(value, replacer, space);
  } catch (error) {
    console.error('[SafeJSON] Stringify error:', error);
    return '{}';
  }
}

/**
 * Validate and parse JSON with type checking
 * @param json - JSON string to parse
 * @param validator - Function to validate the parsed object
 * @param fallback - Value to return if parsing or validation fails
 * @returns Validated parsed JSON or fallback
 */
export function validateJSONParse<T>(
  json: string,
  validator: (value: unknown) => value is T,
  fallback: T,
  context?: string
): T {
  try {
    const parsed = JSON.parse(json);
    if (validator(parsed)) {
      return parsed;
    }
    const contextMessage = context ? ` [Context: ${context}]` : '';
    console.error(`[SafeJSON] Validation failed${contextMessage}: Invalid structure`);
    return fallback;
  } catch (error) {
    const contextMessage = context ? ` [Context: ${context}]` : '';
    console.error(`[SafeJSON] Parse error${contextMessage}:`, error);
    return fallback;
  }
}

/**
 * Try to parse JSON, return null if fails
 * @param json - JSON string to parse
 * @returns Parsed JSON or null
 */
export function tryJSONParse<T = any>(json: string): T | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}