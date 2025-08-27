# Changelog

All notable changes to the Claude-Playwright Toolkit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.5] - 2025-08-27

### 🚨 Alpha Release
**⚠️ This is an alpha release for early testing and feedback. APIs may change between versions.**

### 🚀 Initial Alpha Release

This is the initial release of the Claude-Playwright Toolkit, providing seamless integration between Claude Code and Playwright MCP for efficient browser automation and testing.

### ✨ Added

#### 🎯 Browser Session Management
- **Real Browser Sessions**: Capture and reuse actual login sessions with cookies and authentication state
- **8-Hour Session Caching**: Automatic session expiration and extension management
- **Profile-Based Sessions**: Associate sessions with specific browser profiles
- **Session Validation**: Automatic expiry checking and cleanup of invalid sessions
- **Session Health Monitoring**: Check session validity and get extension recommendations

#### 🎭 Browser Profile Management
- **Role-Based Profiles**: Pre-configured profiles for admin, user, guest, and mobile users
- **Custom Profile Creation**: Create tailored browser profiles with specific viewport, user-agent, and permissions
- **Profile Persistence**: Persistent browser data across test runs
- **Profile Templates**: Quick setup with default configurations for common scenarios

#### 🏗️ Smart Code Generation (Scaffold Commands)
- **Page Object Generation**: Create Playwright Page Object Model classes with BasePage inheritance
- **Test File Generation**: Generate complete test files with proper structure and imports
- **Fixture Generation**: Create custom test fixtures including authentication and data fixtures
- **Template-Based Code**: Consistent code generation following project patterns

#### 🔧 MCP Integration
- **Automatic Configuration**: Seamless setup with Claude Code MCP integration
- **Project Templates**: Minimal, Enterprise, and Testing templates for different project needs
- **Interactive Setup**: Guided project initialization with intelligent defaults

#### 📋 CLI Commands

**Project Initialization**
- `claude-playwright init` - Initialize new project with MCP integration
- `claude-playwright configure-mcp` - Setup MCP without full project init

**Session Management** 
- `claude-playwright session save <name>` - Capture real browser session
- `claude-playwright session load <name>` - Load saved session
- `claude-playwright session list` - Show all sessions with status
- `claude-playwright session clear` - Remove expired sessions
- `claude-playwright session delete <name>` - Delete specific session
- `claude-playwright session health [name]` - Check session health
- `claude-playwright session extend <name>` - Extend session expiry

**Profile Management**
- `claude-playwright profile setup` - Create default profiles
- `claude-playwright profile create <name>` - Create custom profile
- `claude-playwright profile list` - Show all profiles
- `claude-playwright profile show <name>` - Display profile details
- `claude-playwright profile delete <name>` - Remove profile

**Code Generation**
- `claude-playwright scaffold page <name>` - Generate Page Object Model
- `claude-playwright scaffold test <name>` - Generate test file
- `claude-playwright scaffold fixture <name>` - Generate test fixture

**System Monitoring**
- `claude-playwright mcp-status` - Check MCP integration status

#### 🎨 Template System
- **Minimal Template**: Basic Playwright setup with simple Page Object Model
- **Enterprise Template**: Advanced configuration with Docker, CI/CD, and utilities  
- **Testing Template**: Testing-focused configuration with advanced fixtures

#### 🌍 Environment Support
- **Environment Variables**: Support for custom session directories, profiles, and MCP configuration
- **Cross-Platform**: Compatible with macOS, Windows, and Linux
- **Node.js 16+**: Modern Node.js support with TypeScript compilation

### 🔧 Technical Details

#### 📦 Package Configuration
- **Name**: `claude-playwright`
- **Version**: `0.1.0-alpha.5`
- **License**: MIT
- **Node.js Compatibility**: >=16.0.0
- **TypeScript**: Full TypeScript support with declaration files
- **CLI Binary**: `claude-playwright` command available globally

#### 📚 Dependencies
- **Commander**: CLI framework for command parsing
- **Chalk**: Colorized console output
- **Inquirer**: Interactive CLI prompts
- **fs-extra**: Enhanced file system operations
- **Playwright**: Peer dependency for browser automation

#### 🎯 Core Classes
- `SessionManager`: Browser session lifecycle management
- `BrowserProfileManager`: Browser profile creation and management
- `MCPIntegration`: Claude Code MCP configuration
- `TemplateGenerator`: Project template generation

### 🏁 Getting Started

```bash
# Install globally
npm install -g claude-playwright

# Initialize new project
claude-playwright init

# Setup browser profiles
claude-playwright profile setup

# Capture authenticated session
claude-playwright session save my-site
```

### 🎯 What's Next

This initial release provides a solid foundation for Claude Code + Playwright integration. Future versions will expand with:
- Enhanced profile customization
- Advanced session management features
- Additional project templates
- Performance optimizations
- Extended MCP capabilities

---

**Full Documentation**: [README.md](./README.md)  
**License**: [MIT](./LICENSE)  
**Issues**: [GitHub Issues](https://github.com/smartlabs/claude-playwright/issues)