# Environment Variables Configuration

## claude-playwright-toolkit Environment Variables

Configure the behavior of claude-playwright-toolkit for different environments using these environment variables.

### Base URL Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | Primary base URL for navigation |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Alternative base URL (fallback) |

### Timeout Configuration

Adjust timeouts for different environments (CI/CD, Docker, slow networks):

| Variable | Default | Description | Recommended for CI/CD |
|----------|---------|-------------|----------------------|
| `PLAYWRIGHT_NAVIGATION_TIMEOUT` | `30000` (30s) | Page navigation timeout | `60000` (60s) |
| `PLAYWRIGHT_ACTION_TIMEOUT` | `15000` (15s) | Click/type operation timeout | `30000` (30s) |
| `PLAYWRIGHT_SELECTOR_TIMEOUT` | `10000` (10s) | Element selector timeout | `20000` (20s) |
| `PLAYWRIGHT_BROWSER_TIMEOUT` | `30000` (30s) | Browser launch timeout | `60000` (60s) |

### Usage Examples

#### Local Development
```bash
# Default settings work well
npm start
```

#### CI/CD Environment
```bash
# Longer timeouts for slower CI environments
export PLAYWRIGHT_NAVIGATION_TIMEOUT=60000
export PLAYWRIGHT_ACTION_TIMEOUT=30000
export PLAYWRIGHT_SELECTOR_TIMEOUT=20000
export PLAYWRIGHT_BROWSER_TIMEOUT=60000
npm start
```

#### Docker Container
```bash
# Docker environments may need longer timeouts
docker run -e PLAYWRIGHT_NAVIGATION_TIMEOUT=45000 \
           -e PLAYWRIGHT_ACTION_TIMEOUT=20000 \
           -e PLAYWRIGHT_BROWSER_TIMEOUT=45000 \
           claude-playwright
```

#### Slow Network/3G Testing
```bash
# Extra time for slow network conditions
export PLAYWRIGHT_NAVIGATION_TIMEOUT=90000
export PLAYWRIGHT_ACTION_TIMEOUT=30000
export BASE_URL=https://staging.example.com
npm start
```

### Debugging

Enable timeout logging to see configured values:
```bash
# The MCP server logs timeout configuration on startup:
[Claude-Playwright MCP] Timeouts configured: {
  navigation: "60000ms",
  action: "30000ms",
  selector: "20000ms",
  browserLaunch: "60000ms"
}
```

### Best Practices

1. **Start with defaults** - Only adjust if you experience timeout issues
2. **Incremental increases** - Double the timeout first, then adjust as needed
3. **Environment-specific** - Set different values for dev/staging/production
4. **Monitor performance** - Higher timeouts can mask performance issues
5. **Document changes** - Note why specific timeout values were chosen

### Common Scenarios

#### GitHub Actions
```yaml
- name: Run Playwright tests
  env:
    PLAYWRIGHT_NAVIGATION_TIMEOUT: 60000
    PLAYWRIGHT_ACTION_TIMEOUT: 30000
    PLAYWRIGHT_BROWSER_TIMEOUT: 60000
  run: npm test
```

#### Jenkins
```groovy
environment {
  PLAYWRIGHT_NAVIGATION_TIMEOUT = '60000'
  PLAYWRIGHT_ACTION_TIMEOUT = '30000'
}
```

#### Kubernetes
```yaml
env:
  - name: PLAYWRIGHT_NAVIGATION_TIMEOUT
    value: "60000"
  - name: PLAYWRIGHT_ACTION_TIMEOUT
    value: "30000"
```

### Troubleshooting

**Issue:** Timeout errors in CI/CD
**Solution:** Increase timeouts by 2x:
```bash
export PLAYWRIGHT_NAVIGATION_TIMEOUT=60000
export PLAYWRIGHT_ACTION_TIMEOUT=30000
```

**Issue:** Browser fails to launch in Docker
**Solution:** Increase browser timeout:
```bash
export PLAYWRIGHT_BROWSER_TIMEOUT=60000
```

**Issue:** Slow network causing navigation timeouts
**Solution:** Increase navigation timeout:
```bash
export PLAYWRIGHT_NAVIGATION_TIMEOUT=90000
```