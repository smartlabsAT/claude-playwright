# Changelog

All notable changes to Claude Playwright will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.16] - 2025-08-28

### 🏗️ Major Architecture Overhaul

#### Changed
- **Complete TypeScript Migration**: Entire codebase now in TypeScript
- **Modern Build System**: Switched to tsup for dual CJS/ESM builds
- **Focused Functionality**: Removed all scaffolding and template features
- **50% Size Reduction**: CLI reduced from 141KB to 71KB

#### Added
- **TypeScript MCP Server**: Full type safety in MCP implementation
- **Dual Package Support**: Both CommonJS and ES Module outputs
- **URL Validation**: Enhanced BASE_URL configuration with validation
- **Better Error Handling**: Comprehensive TypeScript error types

#### Removed
- ❌ All project initialization features (`init` command)
- ❌ Template system and `/templates` directory
- ❌ Scaffold commands and generators
- ❌ `/examples/scaffold-examples` directory
- ❌ Old interceptor/wrapper scripts
- ❌ ~2000+ lines of obsolete code

## [0.1.0-alpha.15] - 2025-08-27

### Fixed
- Enhanced interceptor with deep URL correction

## [0.1.0-alpha.14] - 2025-08-27

### Added
- URL validation for BASE_URL configuration
- Improved error messages for configuration issues

## [0.1.0-alpha.5] - 2025-08-27

### 🚨 Initial Alpha Release
**⚠️ This is an alpha release for early testing and feedback.**

### ✨ Added

#### 🎯 Browser Session Management
- **Real Browser Sessions**: Capture and reuse actual login sessions with cookies and authentication state
- **8-Hour Session Caching**: Automatic session expiration and extension management
- **Profile-Based Sessions**: Associate sessions with specific browser profiles
- **Session Validation**: Automatic expiry checking and cleanup of invalid sessions
- **Session Health Monitoring**: Check session validity and get extension recommendations

#### 🎭 Browser Profile Management
- **Default Profiles**: Pre-configured desktop, mobile, and tablet profiles
- **Custom Profile Creation**: Create tailored browser profiles with specific viewport and user-agent
- **Profile Persistence**: Persistent browser data across test runs
- **Global Profile Storage**: Profiles shared across all projects

#### 🔧 MCP Integration
- **Automatic Configuration**: Seamless setup with Claude Code MCP integration
- **20+ Browser Tools**: Complete browser automation toolkit for Claude
- **BASE_URL Support**: Environment-specific URL configuration
- **Console & Network Monitoring**: Real-time browser event tracking

### Known Issues
- Sessions expire after 8 hours (by design)
- MCP server requires Claude Code restart after configuration
- Some complex authentication flows may require manual intervention

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0-alpha.16 | 2025-08-28 | Major architecture overhaul, TypeScript migration |
| 0.1.0-alpha.15 | 2025-08-27 | URL correction improvements |
| 0.1.0-alpha.14 | 2025-08-27 | URL validation added |
| 0.1.0-alpha.5 | 2025-08-27 | Initial alpha release |

## Upgrade Guide

### From alpha.5 to alpha.16

The package has undergone major changes. Key differences:

1. **Removed Features**:
   - `init` command no longer exists
   - `scaffold` commands removed
   - Template system removed

2. **New Setup Process**:
   ```bash
   # Old way (no longer works)
   claude-playwright init
   
   # New way
   claude-playwright mcp init --base-url http://localhost:3000
   ```

3. **Core Features Remain**:
   - Session management unchanged
   - Profile management unchanged
   - MCP tools unchanged

4. **Build System**:
   - Now uses TypeScript everywhere
   - Dual CJS/ESM support
   - Requires Node.js 16+

---

For more information, see the [README](README.md) or visit our [GitHub repository](https://github.com/smartlabsAT/claude-playwright).