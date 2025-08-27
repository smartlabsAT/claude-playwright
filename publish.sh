#!/bin/bash

# PUBLISH SCRIPT für claude-playwright Package
# Nach der Umbenennung von @claude-playwright/toolkit zu claude-playwright

set -e

echo "🚀 Starting publication process for claude-playwright..."

# Verify we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: package.json not found. Make sure you're in the project root."
    exit 1
fi

# Check package name
PACKAGE_NAME=$(node -p "require('./package.json').name")
if [[ "$PACKAGE_NAME" != "claude-playwright" ]]; then
    echo "❌ Error: Package name is '$PACKAGE_NAME', expected 'claude-playwright'"
    exit 1
fi

echo "✅ Package name verified: $PACKAGE_NAME"

# Check version
VERSION=$(node -p "require('./package.json').version")
echo "📦 Version: $VERSION"

# Clean and build
echo "🧹 Cleaning build artifacts..."
rm -rf dist/

echo "🔨 Building project..."
npm run build

if [[ ! -d "dist" ]]; then
    echo "❌ Error: Build failed - dist directory not created"
    exit 1
fi

echo "✅ Build successful"

# Run tests
echo "🧪 Running tests..."
npm test

echo "✅ Tests passed"

# Verify files to be published
echo "📋 Files to be published:"
npm pack --dry-run

echo ""
echo "🎯 Ready to publish!"
echo "Package: claude-playwright"
echo "Version: $VERSION"
echo "Registry: https://registry.npmjs.org/"
echo ""

read -p "Do you want to publish to alpha tag? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 Publishing alpha version to npmjs..."
    npm publish --tag alpha --access public
    echo "✅ Successfully published claude-playwright@$VERSION to alpha tag on npmjs"
    echo ""
    echo "🎉 Installation command for users:"
    echo "npm install -g claude-playwright@alpha"
else
    read -p "Do you want to publish to production? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📤 Publishing production version to npmjs..."
        npm publish --access public
        echo "✅ Successfully published claude-playwright@$VERSION to npmjs"
        echo ""
        echo "🎉 Installation command for users:"
        echo "npm install -g claude-playwright"
    else
        echo "📋 Publication cancelled. To publish manually:"
        echo "npm publish --tag alpha --access public"
        echo "OR"
        echo "npm publish --access public"
    fi
fi

echo ""
echo "🎯 Post-publication checklist:"
echo "- Test global installation: npm install -g claude-playwright@alpha"
echo "- Verify CLI works: claude-playwright --version"
echo "- Check registry: https://www.npmjs.com/package/claude-playwright"
echo "- Update any documentation with new package name"
echo ""
echo "📖 Migration guide available: ./MIGRATION_GUIDE.md"