import { test, expect } from '@playwright/test';
import { SessionManager } from '../core/session-manager';
import { BrowserProfileManager } from '../core/browser-profile';

/**
 * Unit tests for core functionality of claude-playwright
 */
test.describe('Core Functionality Tests', () => {
  test('SessionManager should initialize correctly', async () => {
    const sessionManager = new SessionManager('./test-sessions');
    expect(sessionManager).toBeDefined();
    expect(typeof sessionManager.listSessions).toBe('function');
    expect(typeof sessionManager.saveSession).toBe('function');
    expect(typeof sessionManager.loadSession).toBe('function');
  });

  test('BrowserProfileManager should initialize correctly', async () => {
    const profileManager = new BrowserProfileManager();
    expect(profileManager).toBeDefined();
    expect(typeof profileManager.createProfile).toBe('function');
    expect(typeof profileManager.loadProfile).toBe('function');
    expect(typeof profileManager.listProfiles).toBe('function');
  });

  test('Basic toolkit validation', async () => {
    // Simple validation test that core classes exist
    expect(SessionManager).toBeDefined();
    expect(BrowserProfileManager).toBeDefined();
  });
});