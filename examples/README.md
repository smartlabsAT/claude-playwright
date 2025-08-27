# Claude-Playwright Toolkit - Example Code

This directory contains comprehensive examples demonstrating all Phase 1.6 features of the Claude-Playwright Toolkit.

## 📁 Directory Structure

```
examples/
├── README.md                    # This file
├── session-management/          # Real browser session examples
├── profile-management/          # Browser profile examples  
├── scaffold-examples/           # Code generation examples
├── integration-examples/        # Complete integration workflows
└── advanced-patterns/          # Advanced usage patterns
```

## 🚀 Quick Start Examples

### 1. Session Management Workflow
```bash
# Navigate to session examples
cd examples/session-management

# Run the complete workflow
./run-session-workflow.sh
```

### 2. Profile-Based Testing
```bash
# Navigate to profile examples
cd examples/profile-management

# Test with different profiles
npm run test:profiles
```

### 3. Code Generation
```bash
# Navigate to scaffold examples
cd examples/scaffold-examples

# Generate complete page objects and tests
./generate-examples.sh
```

## 📚 Example Categories

### Session Management Examples
- **basic-session-capture.js** - Simple session save/load
- **authenticated-testing.js** - Using sessions in tests
- **session-validation.js** - Session integrity checking
- **multi-environment-sessions.js** - Environment-specific sessions

### Profile Management Examples
- **default-profiles.js** - Using built-in profiles
- **custom-profiles.js** - Creating custom configurations
- **profile-switching.js** - Dynamic profile changes
- **mobile-testing.js** - Mobile device simulation

### Scaffold System Examples
- **page-generation/** - Complete page object examples
- **test-generation/** - Test file generation
- **fixture-generation/** - Custom fixtures
- **component-generation/** - UI component scaffolding

### Integration Examples
- **complete-workflow/** - End-to-end testing workflow
- **ci-cd-integration/** - Continuous integration setup
- **docker-examples/** - Containerized testing
- **mcp-integration/** - Claude Code MCP examples

## 🎯 Learning Path

1. **Start Here**: `session-management/basic-session-capture.js`
2. **Authentication**: `session-management/authenticated-testing.js`
3. **Profiles**: `profile-management/default-profiles.js`
4. **Generation**: `scaffold-examples/page-generation/`
5. **Advanced**: `integration-examples/complete-workflow/`

## 💡 Tips for Using Examples

- Each example includes detailed comments explaining the code
- Run examples in order for best learning experience
- Modify examples to match your specific use cases
- Check console output for detailed explanations

## 🤝 Contributing Examples

Want to add more examples? Please:

1. Follow the existing structure and naming conventions
2. Include comprehensive comments
3. Add corresponding test files
4. Update this README with your example

---

**Note**: All examples are designed to work with the Phase 1.6 implementation of the toolkit.