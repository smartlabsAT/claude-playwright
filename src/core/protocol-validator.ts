/**
 * MCP Protocol Validation System
 * 
 * Ensures all MCP messages conform to JSON-RPC 2.0 specification
 * and provides validation for token handling and protocol versions.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  validatedMessage?: any;
  warningMessages?: string[];
}

export interface SafeInput {
  originalInput: any;
  sanitizedInput: any;
  sanitizationApplied: string[];
}

export class ProtocolError extends Error {
  public type: 'VALIDATION_ERROR' | 'TOKEN_ERROR' | 'VERSION_MISMATCH';
  public originalMessage?: any;
  
  constructor(message: string, type: ProtocolError['type'], originalMessage?: any) {
    super(message);
    this.name = 'ProtocolError';
    this.type = type;
    this.originalMessage = originalMessage;
  }
}

export interface MCPProtocolValidator {
  validateMessage(message: any): ValidationResult;
  validateTokenFormat(token: string): boolean;
  enforceProtocolVersion(version: string): void;
  sanitizeInput(input: any): SafeInput;
}

export class DefaultMCPProtocolValidator implements MCPProtocolValidator {
  private supportedVersions = ['2.0', '2.0.0'];
  private currentVersion = '2.0.0';
  
  /**
   * Validates MCP message against JSON-RPC 2.0 specification
   */
  validateMessage(message: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if message exists
    if (!message) {
      return {
        isValid: false,
        errors: ['Message is null or undefined']
      };
    }
    
    // Validate JSON-RPC structure
    if (typeof message !== 'object') {
      return {
        isValid: false,
        errors: ['Message must be an object']
      };
    }
    
    // Check for required JSON-RPC 2.0 fields
    if (message.jsonrpc !== '2.0') {
      errors.push('Missing or invalid jsonrpc field (must be "2.0")');
    }
    
    // Validate message type patterns
    if (this.isRequest(message)) {
      this.validateRequest(message, errors, warnings);
    } else if (this.isResponse(message)) {
      this.validateResponse(message, errors, warnings);
    } else if (this.isNotification(message)) {
      this.validateNotification(message, errors, warnings);
    } else {
      errors.push('Message is not a valid JSON-RPC request, response, or notification');
    }
    
    // Validate content structure for MCP-specific messages
    this.validateMCPContent(message, errors, warnings);
    
    return {
      isValid: errors.length === 0,
      errors,
      validatedMessage: errors.length === 0 ? message : undefined,
      warningMessages: warnings.length > 0 ? warnings : undefined
    };
  }
  
  /**
   * Validates token format and structure
   */
  validateTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }
    
    // Basic token format validation
    if (token.length < 10) {
      return false;
    }
    
    // Check for common token patterns
    const tokenPatterns = [
      /^[A-Za-z0-9_-]+$/, // Base64-like
      /^[A-Fa-f0-9]+$/,   // Hexadecimal
      /^[A-Za-z0-9+/=]+$/ // Base64 with padding
    ];
    
    return tokenPatterns.some(pattern => pattern.test(token));
  }
  
  /**
   * Enforces protocol version compatibility
   */
  enforceProtocolVersion(version: string): void {
    if (!this.supportedVersions.includes(version)) {
      throw new ProtocolError(
        `Unsupported protocol version: ${version}. Supported versions: ${this.supportedVersions.join(', ')}`,
        'VERSION_MISMATCH'
      );
    }
    this.currentVersion = version;
  }
  
  /**
   * Sanitizes input to prevent injection attacks
   */
  sanitizeInput(input: any): SafeInput {
    const sanitizationApplied: string[] = [];
    let sanitizedInput = input;
    
    if (typeof input === 'string') {
      const original = input;
      
      // Remove potential script injections
      sanitizedInput = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      if (sanitizedInput !== original) {
        sanitizationApplied.push('Removed script tags');
      }
      
      // Remove potential HTML injections
      const htmlRemoved = sanitizedInput.replace(/<[^>]*>/g, '');
      if (htmlRemoved !== sanitizedInput) {
        sanitizationApplied.push('Removed HTML tags');
        sanitizedInput = htmlRemoved;
      }
      
      // Escape special characters that could be used in injections
      const escaped = sanitizedInput
        .replace(/[&<>"']/g, (match: string) => {
          const escapeMap: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
          };
          return escapeMap[match];
        });
      
      if (escaped !== sanitizedInput) {
        sanitizationApplied.push('Escaped special characters');
        sanitizedInput = escaped;
      }
    } else if (typeof input === 'object' && input !== null) {
      // Recursively sanitize object properties
      const result: any = Array.isArray(input) ? [] : {};
      
      for (const key in input) {
        if (input.hasOwnProperty(key)) {
          const sanitizedValue = this.sanitizeInput(input[key]);
          result[key] = sanitizedValue.sanitizedInput;
          sanitizationApplied.push(...sanitizedValue.sanitizationApplied);
        }
      }
      
      sanitizedInput = result;
    }
    
    return {
      originalInput: input,
      sanitizedInput,
      sanitizationApplied: Array.from(new Set(sanitizationApplied)) // Remove duplicates
    };
  }
  
  // Private helper methods
  
  private isRequest(message: any): boolean {
    return message.method && message.id !== undefined;
  }
  
  private isResponse(message: any): boolean {
    return message.id !== undefined && (message.result !== undefined || message.error !== undefined);
  }
  
  private isNotification(message: any): boolean {
    return message.method && message.id === undefined;
  }
  
  private validateRequest(message: any, errors: string[], warnings: string[]): void {
    if (!message.method || typeof message.method !== 'string') {
      errors.push('Request must have a string method field');
    }
    
    if (message.id === null) {
      errors.push('Request id cannot be null');
    }
    
    // Validate params if present
    if (message.params !== undefined && typeof message.params !== 'object') {
      errors.push('Request params must be an object or array');
    }
  }
  
  private validateResponse(message: any, errors: string[], warnings: string[]): void {
    if (message.result !== undefined && message.error !== undefined) {
      errors.push('Response cannot have both result and error fields');
    }
    
    if (message.result === undefined && message.error === undefined) {
      errors.push('Response must have either result or error field');
    }
    
    if (message.error && !this.isValidErrorObject(message.error)) {
      errors.push('Response error must be a valid error object with code and message');
    }
  }
  
  private validateNotification(message: any, errors: string[], warnings: string[]): void {
    if (!message.method || typeof message.method !== 'string') {
      errors.push('Notification must have a string method field');
    }
    
    if (message.id !== undefined) {
      errors.push('Notification must not have an id field');
    }
  }
  
  private validateMCPContent(message: any, errors: string[], warnings: string[]): void {
    // MCP-specific validation rules
    if (message.result && message.result.content) {
      if (!Array.isArray(message.result.content)) {
        errors.push('MCP result content must be an array');
      } else {
        // Validate each content item
        message.result.content.forEach((item: any, index: number) => {
          if (!item.type || typeof item.type !== 'string') {
            errors.push(`MCP content item ${index} must have a string type field`);
          }
          
          if (item.type === 'text' && (!item.text || typeof item.text !== 'string')) {
            errors.push(`MCP text content item ${index} must have a string text field`);
          }
        });
      }
    }
    
    // Check for common MCP tool patterns
    if (message.method && message.method.startsWith('tools/call')) {
      if (!message.params || !message.params.name) {
        errors.push('MCP tool call must have a name parameter');
      }
    }
  }
  
  private isValidErrorObject(error: any): boolean {
    return error && 
           typeof error.code === 'number' && 
           typeof error.message === 'string';
  }
}