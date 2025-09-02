/**
 * Protocol Error Recovery System
 * 
 * Attempts to recover from protocol validation errors through
 * intelligent message reformation and graceful degradation.
 */

import { ProtocolError } from './protocol-validator.js';

export interface RecoveryResult {
  recovered: boolean;
  recoveryMethod?: string;
  recoveredMessage?: any;
  error?: string;
  degradationLevel?: 'none' | 'minimal' | 'significant' | 'fallback';
}

export interface RecoveryStrategy {
  name: string;
  canHandle: (error: ProtocolError) => boolean;
  attempt: (error: ProtocolError) => Promise<RecoveryResult>;
}

export class ProtocolErrorRecovery {
  private strategies: RecoveryStrategy[];

  constructor() {
    this.strategies = [
      new ValidationErrorRecoveryStrategy(),
      new TokenErrorRecoveryStrategy(), 
      new VersionMismatchRecoveryStrategy(),
      new MessageReformationStrategy(),
      new FallbackRecoveryStrategy()
    ];

    console.error('[ProtocolErrorRecovery] Initialized with strategies:', this.strategies.map(s => s.name));
  }

  /**
   * Main entry point for error recovery
   */
  async handleProtocolError(error: ProtocolError): Promise<RecoveryResult> {
    console.error(`[ProtocolErrorRecovery] Attempting recovery for ${error.type}: ${error.message}`);

    // Try each strategy in order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(error)) {
        console.error(`[ProtocolErrorRecovery] Trying strategy: ${strategy.name}`);
        
        try {
          const result = await strategy.attempt(error);
          
          if (result.recovered) {
            console.error(`[ProtocolErrorRecovery] ✅ Recovery successful using ${strategy.name}`);
            return result;
          } else {
            console.error(`[ProtocolErrorRecovery] ❌ Strategy ${strategy.name} failed: ${result.error}`);
          }
        } catch (strategyError) {
          console.error(`[ProtocolErrorRecovery] ❌ Strategy ${strategy.name} threw error:`, strategyError);
        }
      }
    }

    console.error('[ProtocolErrorRecovery] ❌ All recovery strategies failed');
    return {
      recovered: false,
      error: 'All recovery strategies exhausted',
      degradationLevel: 'fallback'
    };
  }
}

/**
 * Recovery strategy for validation errors
 */
class ValidationErrorRecoveryStrategy implements RecoveryStrategy {
  name = 'ValidationErrorRecovery';

  canHandle(error: ProtocolError): boolean {
    return error.type === 'VALIDATION_ERROR';
  }

  async attempt(error: ProtocolError): Promise<RecoveryResult> {
    const message = error.originalMessage;
    
    if (!message || typeof message !== 'object') {
      return { recovered: false, error: 'Cannot recover: no valid original message' };
    }

    let recovered = { ...message };
    const recoveryActions: string[] = [];

    // Fix missing jsonrpc field
    if (!recovered.jsonrpc || recovered.jsonrpc !== '2.0') {
      recovered.jsonrpc = '2.0';
      recoveryActions.push('Added jsonrpc: "2.0" field');
    }

    // Generate missing id for requests
    if (recovered.method && !recovered.hasOwnProperty('id')) {
      // This might be a notification, but let's assume it should be a request
      recovered.id = Math.random().toString(36).substr(2, 9);
      recoveryActions.push('Generated missing request ID');
    }

    // Fix invalid params structure
    if (recovered.params !== undefined && typeof recovered.params !== 'object') {
      const originalParams = recovered.params;
      recovered.params = { value: originalParams };
      recoveryActions.push('Wrapped non-object params in object structure');
    }

    // Fix MCP content structure
    if (recovered.result && recovered.result.content && !Array.isArray(recovered.result.content)) {
      const originalContent = recovered.result.content;
      recovered.result.content = [{
        type: 'text',
        text: typeof originalContent === 'string' ? originalContent : String(originalContent)
      }];
      recoveryActions.push('Fixed MCP content structure');
    }

    // Fix error object structure in responses
    if (recovered.error && (!recovered.error.code || !recovered.error.message)) {
      const originalError = recovered.error;
      recovered.error = {
        code: originalError.code || -32603,
        message: originalError.message || String(originalError),
        data: originalError.data
      };
      recoveryActions.push('Fixed error object structure');
    }

    if (recoveryActions.length > 0) {
      return {
        recovered: true,
        recoveryMethod: this.name,
        recoveredMessage: recovered,
        degradationLevel: 'minimal'
      };
    }

    return { recovered: false, error: 'No recoverable validation issues found' };
  }
}

/**
 * Recovery strategy for token errors
 */
class TokenErrorRecoveryStrategy implements RecoveryStrategy {
  name = 'TokenErrorRecovery';

  canHandle(error: ProtocolError): boolean {
    return error.type === 'TOKEN_ERROR';
  }

  async attempt(error: ProtocolError): Promise<RecoveryResult> {
    // Try to refresh or regenerate token
    console.error('[TokenRecovery] Attempting token refresh/regeneration');

    // In a real implementation, this would integrate with the authentication system
    // For now, we'll simulate a token refresh attempt
    try {
      const newToken = await this.refreshToken();
      
      if (newToken) {
        const message = error.originalMessage;
        if (message && message.headers) {
          message.headers.authorization = `Bearer ${newToken}`;
        }

        return {
          recovered: true,
          recoveryMethod: this.name,
          recoveredMessage: message,
          degradationLevel: 'none'
        };
      }
    } catch (refreshError) {
      console.error('[TokenRecovery] Token refresh failed:', refreshError);
    }

    // Fallback: try to continue without token (degraded mode)
    return {
      recovered: true,
      recoveryMethod: `${this.name} (no-auth fallback)`,
      recoveredMessage: error.originalMessage,
      degradationLevel: 'significant'
    };
  }

  private async refreshToken(): Promise<string | null> {
    // Placeholder for actual token refresh logic
    // This would integrate with your authentication system
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async operation
    
    // Return null to simulate token refresh failure for now
    return null;
  }
}

/**
 * Recovery strategy for version mismatch
 */
class VersionMismatchRecoveryStrategy implements RecoveryStrategy {
  name = 'VersionMismatchRecovery';

  canHandle(error: ProtocolError): boolean {
    return error.type === 'VERSION_MISMATCH';
  }

  async attempt(error: ProtocolError): Promise<RecoveryResult> {
    const message = error.originalMessage;
    
    if (!message || typeof message !== 'object') {
      return { recovered: false, error: 'No message to negotiate version for' };
    }

    // Try to negotiate to supported version
    const supportedVersions = ['2.0', '2.0.0'];
    let recovered = { ...message };

    // Force to supported version
    recovered.jsonrpc = '2.0';

    // Add version negotiation metadata if applicable
    if (!recovered.params) {
      recovered.params = {};
    }
    
    if (typeof recovered.params === 'object') {
      (recovered.params as any).__negotiated_version = '2.0';
    }

    return {
      recovered: true,
      recoveryMethod: this.name,
      recoveredMessage: recovered,
      degradationLevel: 'minimal'
    };
  }
}

/**
 * General message reformation strategy
 */
class MessageReformationStrategy implements RecoveryStrategy {
  name = 'MessageReformation';

  canHandle(error: ProtocolError): boolean {
    return true; // Can attempt to handle any error
  }

  async attempt(error: ProtocolError): Promise<RecoveryResult> {
    const original = error.originalMessage;
    
    if (!original) {
      return { recovered: false, error: 'No original message available for reformation' };
    }

    // Try to create a well-formed message from whatever we have
    let reformed: any = {};

    // Ensure basic JSON-RPC structure
    reformed.jsonrpc = '2.0';

    // Try to preserve method if it exists
    if (original.method) {
      reformed.method = String(original.method);
      reformed.id = original.id || Math.random().toString(36).substr(2, 9);
    } else {
      // Assume this is a response
      reformed.id = original.id || Math.random().toString(36).substr(2, 9);
    }

    // Try to preserve params or result
    if (original.params) {
      reformed.params = typeof original.params === 'object' ? original.params : { value: original.params };
    } else if (original.result) {
      reformed.result = original.result;
    } else if (original.error) {
      reformed.error = {
        code: original.error.code || -32603,
        message: original.error.message || String(original.error)
      };
    } else {
      // Create a basic result from any remaining data
      reformed.result = {
        content: [{
          type: 'text',
          text: JSON.stringify(original)
        }]
      };
    }

    return {
      recovered: true,
      recoveryMethod: this.name,
      recoveredMessage: reformed,
      degradationLevel: 'significant'
    };
  }
}

/**
 * Fallback recovery strategy - always succeeds but with maximum degradation
 */
class FallbackRecoveryStrategy implements RecoveryStrategy {
  name = 'FallbackRecovery';

  canHandle(error: ProtocolError): boolean {
    return true; // Always can handle as last resort
  }

  async attempt(error: ProtocolError): Promise<RecoveryResult> {
    // Create minimal valid response indicating error recovery
    const fallbackMessage = {
      jsonrpc: '2.0',
      id: error.originalMessage?.id || Math.random().toString(36).substr(2, 9),
      result: {
        content: [{
          type: 'text',
          text: `Protocol error recovered in degraded mode: ${error.message}`
        }],
        isError: true,
        degraded: true
      }
    };

    return {
      recovered: true,
      recoveryMethod: this.name,
      recoveredMessage: fallbackMessage,
      degradationLevel: 'fallback'
    };
  }
}