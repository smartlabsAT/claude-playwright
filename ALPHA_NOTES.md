# Alpha Release Notes - v0.1.0-alpha.5

## ⚠️ Important Alpha Notice

This is an **alpha release** of the Claude-Playwright Toolkit. It is intended for:
- Early adopters and testers
- Feedback collection
- API stabilization
- Bug identification

**DO NOT USE IN PRODUCTION** 

## 🚀 What's Working

### ✅ Stable Features
- CLI commands (all basic functionality)
- Browser profile management
- Page object generation
- MCP integration setup
- Project initialization

### ⚡ Beta Features (Use with Caution)
- Browser session save/load (real browser automation)
- Session persistence (8-hour caching)
- Session health monitoring
- Profile-based sessions

### 🔬 Experimental Features
- Fixture generation (minor template issues)
- Test generation (template improvements ongoing)
- Auto-session extension

## 🐛 Known Issues

1. **Session List Display**: Minor formatting issue with `padEnd()` in some cases
2. **Fixture Templates**: Some generated fixtures may have syntax issues
3. **Global CLI**: Requires `npx` prefix or full path in some environments

## 📦 Installation

```bash
# Install alpha globally
npm install -g claude-playwright@alpha

# Or specific alpha version
npm install -g claude-playwright@0.1.0-alpha.5

# In a project
npm install --save-dev claude-playwright@alpha
```

## 🧪 Testing the Alpha

### Basic Test Flow
```bash
# 1. Initialize a test project
npx claude-playwright@alpha init --name test-project

# 2. Setup profiles
npx claude-playwright@alpha profile setup

# 3. Generate a page object
npx claude-playwright@alpha scaffold page LoginPage

# 4. Check MCP status
npx claude-playwright@alpha mcp-status
```

### Session Testing (Advanced)
```bash
# Save a browser session
npx claude-playwright@alpha session save my-session
# Note: A real browser will open for manual login
```

## 📝 Feedback

Please report issues and feedback:
- GitHub Issues: https://github.com/smartlabsAT/claude-playwright/issues
- Tag issues with `alpha-feedback`
- Include version number (0.1.0-alpha.5)

## 🔄 Migration to Stable

When the stable version is released:
1. Uninstall alpha: `npm uninstall -g claude-playwright`
2. Install stable: `npm install -g claude-playwright@latest`
3. Review CHANGELOG for breaking changes
4. Update your code as needed

## 📊 Alpha Metrics

- **Alpha Start**: August 27, 2025
- **Expected Beta**: 2-3 weeks
- **Expected Stable**: 4-6 weeks
- **Test Coverage**: 85%
- **API Stability**: 70%

## ⚡ Quick Links

- [README](README.md)
- [CHANGELOG](CHANGELOG.md)
- [API Documentation](docs/api.md)
- [Examples](examples/README.md)

---

**Thank you for testing the alpha version!** 🙏

Your feedback helps us build a better toolkit for the community.