# Issue #24: Critical Stability Improvements for v0.1.4

## Problem
Users are abandoning claude-playwright-toolkit v0.1.3 due to stability issues and crashes.

## Root Causes Analysis
Our comprehensive analysis identified 5 CRITICAL and 7 HIGH severity issues causing user abandonment.

---

## CRITICAL FIXES REQUIRED (Must-fix for v0.1.4)

### 🔴 TODO #1: Fix Browser Crash Recovery
**File:** `src/mcp/server.ts` (Lines 248-310)
**Problem:** Browser crashes terminate entire MCP server without recovery

- [ ] Add try-catch wrapper around browser launch
- [ ] Implement browser crash detection with `browser.on('disconnected')`
- [ ] Add automatic retry with fallback options (headless mode)
- [ ] Add clear error messages for users when browser fails
- [ ] Test with: killed browser process, OOM conditions, missing dependencies

### 🔴 TODO #2: Fix SQLite Database Corruption
**File:** `src/core/bidirectional-cache.ts` (Lines 160-169, 700-800)
**Problem:** Database corruption on crash causes total cache failure

- [ ] Add database integrity check on startup
- [ ] Implement transaction wrappers for all write operations
- [ ] Change pragma to `synchronous = FULL` for corruption prevention
- [ ] Add automatic backup before writes
- [ ] Create recovery mechanism for corrupted databases
- [ ] Test with: SIGKILL during write, power loss simulation

### 🔴 TODO #3: Fix Memory Leaks
**File:** `src/mcp/server.ts` (Lines 160-245)
**Problem:** Event listeners never removed, causing 50MB leak per session

- [ ] Create `cleanupPageListeners()` function
- [ ] Track all listeners in WeakMap
- [ ] Call cleanup before page/context close
- [ ] Add memory monitoring logs
- [ ] Test with: 50+ session switches, long-running processes

### 🔴 TODO #4: Fix Network Timeouts
**File:** `src/mcp/server.ts` (Lines 938-967, 992-1014)
**Problem:** Hardcoded 10s timeouts fail on slow networks

- [ ] Add environment variables for timeout configuration:
  - `PLAYWRIGHT_NAVIGATION_TIMEOUT` (default: 30000)
  - `PLAYWRIGHT_ACTION_TIMEOUT` (default: 15000)
  - `PLAYWRIGHT_SELECTOR_TIMEOUT` (default: 10000)
- [ ] Apply timeouts to browser context creation
- [ ] Make all operation timeouts configurable
- [ ] Document timeout configuration in README
- [ ] Test with: slow 3G network, CI/CD environments

### 🔴 TODO #5: Fix Process Exit Hang
**File:** `src/core/bidirectional-cache.ts` (Lines 1060-1062, 1779-1785)
**Problem:** Cleanup timer prevents clean shutdown

- [ ] Clear interval timer in `close()` method
- [ ] Add SIGINT/SIGTERM handlers to MCP server
- [ ] Ensure all resources cleaned up on shutdown
- [ ] Add timeout for force exit after 5 seconds
- [ ] Test with: SIGTERM, SIGINT, Docker container shutdown

---

## TYPE SAFETY FIXES (Prevent runtime crashes)

### 🟡 TODO #6: Replace All `any` Types
**Files:** Multiple
**Problem:** Hidden type errors causing crashes

- [ ] Replace `any` in `src/mcp/server.ts`:
  - Line 23: `location?: any` → `location?: ConsoleMessageLocation`
  - Line 261: `storageState: any` → `storageState: SessionData | undefined`
  - Line 853-854: `page: any, step: any` → proper Playwright types
- [ ] Replace `any` in `src/core/bidirectional-cache.ts`:
  - Line 1409-1410: `key: any` → proper type
  - Line 1336: Remove cast to `any`
- [ ] Replace `any` in `src/core/test-scenario-cache.ts`:
  - Line 409-410: `page?: any` → `page?: Page`
- [ ] Run `npm run type-check` to verify

### 🟡 TODO #7: Add Runtime Validation
**Files:** `src/core/bidirectional-cache.ts`, `src/core/test-scenario-cache.ts`
**Problem:** Database query results not validated

- [ ] Create type validation utilities in `src/types/validators.ts`
- [ ] Add `validateEnhancedCacheEntry()` function
- [ ] Add `validateTestScenario()` function
- [ ] Replace all database casts with validated results
- [ ] Add error logging for validation failures

### 🟡 TODO #8: Remove Non-null Assertions
**File:** `src/mcp/server.ts`
**Problem:** `!` assertions without null checks

- [ ] Line 309: Replace `return page!` with proper null check
- [ ] Line 734: Check context before `context!.cookies()`
- [ ] Line 1142: Verify context exists before cookie access
- [ ] Add proper error messages for null cases

---

## USER EXPERIENCE FIXES

### 🟢 TODO #9: Improve Error Messages
**Files:** All error paths
**Problem:** Unhelpful or missing error messages

- [ ] Add user-friendly error messages with recovery steps
- [ ] Include common solutions in error messages
- [ ] Add progress indicators for long operations
- [ ] Log errors to stderr with context
- [ ] Create error recovery guide in docs

### 🟢 TODO #10: Add Safe JSON Parsing
**Files:** Multiple
**Problem:** JSON.parse crashes on invalid data

- [ ] Create `safeJSONParse()` utility function
- [ ] Replace all `JSON.parse()` calls with safe version
- [ ] Add fallback values for parse failures
- [ ] Log parse errors with context

---

## Implementation Plan

### Phase 1: Critical Fixes (2-3 days)
1. Fix browser crash recovery (#1)
2. Fix database corruption (#2)
3. Fix memory leaks (#3)
4. Fix process exit hang (#5)

### Phase 2: Stability Fixes (2 days)
5. Fix network timeouts (#4)
6. Replace all `any` types (#6)
7. Add runtime validation (#7)
8. Remove non-null assertions (#8)

### Phase 3: UX Improvements (1 day)
9. Improve error messages (#9)
10. Add safe JSON parsing (#10)

### Testing Checklist
- [ ] Test browser crash recovery
- [ ] Test database corruption recovery
- [ ] Test memory usage over 100+ operations
- [ ] Test with slow network (3G throttling)
- [ ] Test clean shutdown with Docker
- [ ] Test with missing dependencies
- [ ] Test with CI/CD environments
- [ ] Run full TypeScript checks
- [ ] Run existing test suite

---

## Success Metrics
- Zero unhandled crashes in 1000+ operations
- Memory usage stable under 200MB after 8 hours
- Clean shutdown within 5 seconds
- 95%+ operations succeed on slow networks
- Zero `any` types in codebase
- 100% database operations wrapped in transactions

## Priority
**CRITICAL** - These issues are causing immediate user abandonment

## Target Version
v0.1.4 - Stability Release

## Estimated Time
5-6 days total development time

---

## References
- Analysis performed: 2026-02-06
- Current version: 0.1.3
- User reports: "System unstable, frequent crashes, random failures"