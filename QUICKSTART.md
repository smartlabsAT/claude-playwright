# Claude-Playwright Toolkit - Quick Start Guide

## 🚀 Sofort loslegen - 5 Minuten Setup

Dieser Guide bringt Sie in wenigen Minuten zum Laufen!

## 📦 Schritt 1: Installation (2 Minuten)

```bash
# Toolkit installieren
npm install -g claude-playwright

# Playwright installieren
npm install -D @playwright/test
npx playwright install chromium
```

## 🏗️ Schritt 2: Projekt erstellen (1 Minute)

```bash
# Neues Projekt mit interaktiver Einrichtung
claude-playwright init

# Folgen Sie den Prompts:
# - Projektname eingeben
# - Template wählen (empfohlen: "minimal")
# - MCP Integration bestätigen
```

## ⚡ Schritt 3: Erste Session erstellen (2 Minuten)

```bash
# In Ihr neues Projekt wechseln
cd ihr-projekt-name

# Standard-Profile einrichten
claude-playwright profile setup

# Erste Session für Ihre Webanwendung speichern
claude-playwright session save meine-app --url https://ihre-app.com/login
```

**Was passiert:** Browser öffnet sich → Sie loggen sich manuell ein → Enter drücken → Session gespeichert!

---

## 🎯 Häufigste Anwendungsfälle

### Session Save & Load Workflow

#### 1. Session erstellen und testen

```bash
# Session speichern (Browser öffnet sich für manuellen Login)
claude-playwright session save login-session --url https://app.com/login

# Session prüfen
claude-playwright session list
claude-playwright session health login-session
```

#### 2. Session in Test verwenden

```javascript
// tests/example.spec.ts
import { test, expect } from '@playwright/test';
import { SessionManager } from 'claude-playwright';

test('verwende gespeicherte session', async ({ browser }) => {
  const sessionManager = new SessionManager();
  const storageState = await sessionManager.loadSession('login-session');
  
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  
  await page.goto('https://app.com/dashboard');
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
});
```

### Profile Management Workflow

#### 1. Profile für verschiedene Geräte erstellen

```bash
# Standard-Profile (Desktop, Mobile, Tablet)
claude-playwright profile setup

# Benutzerdefinierte Profile
claude-playwright profile create iphone13 --device mobile --viewport 390x844
claude-playwright profile create large-desktop --device desktop --viewport 2560x1440
```

#### 2. Session mit spezifischem Profil

```bash
# Mobile Session
claude-playwright session save mobile-session --url https://app.com --profile mobile

# Desktop Session
claude-playwright session save desktop-session --url https://app.com --profile desktop
```

### Page Generation Workflow

#### 1. Page Object erstellen

```bash
# Login Page generieren
claude-playwright scaffold page LoginPage --url https://app.com/login

# Weitere Pages
claude-playwright scaffold page DashboardPage --url https://app.com/dashboard
claude-playwright scaffold page ProductPage --url https://app.com/products
```

#### 2. Tests generieren

```bash
# Test mit Session erstellen
claude-playwright scaffold test LoginTest --page-object LoginPage --session login-session

# E2E Test erstellen
claude-playwright scaffold test CompleteFlow --test-type e2e --session login-session
```

---

## 🛠️ Praktische Beispiele

### Beispiel 1: E-Commerce Site testen

```bash
# 1. Projekt erstellen
claude-playwright init --name shop-tests
cd shop-tests

# 2. Profile einrichten
claude-playwright profile setup

# 3. Sessions für verschiedene User erstellen
claude-playwright session save customer-session --url https://shop.com/login
claude-playwright session save admin-session --url https://shop.com/admin

# 4. Page Objects generieren
claude-playwright scaffold page ProductListPage --url https://shop.com/products
claude-playwright scaffold page CartPage --url https://shop.com/cart
claude-playwright scaffold page CheckoutPage --url https://shop.com/checkout

# 5. Tests erstellen
claude-playwright scaffold test ShoppingFlow --session customer-session --test-type e2e
claude-playwright scaffold test AdminPanel --session admin-session --test-type e2e
```

### Beispiel 2: Multi-Device Testing

```bash
# 1. Device-spezifische Profile
claude-playwright profile create mobile-portrait --device mobile --viewport 375x667
claude-playwright profile create mobile-landscape --device mobile --viewport 667x375
claude-playwright profile create tablet --device tablet --viewport 768x1024

# 2. Sessions für jedes Device
claude-playwright session save mobile-session --profile mobile-portrait --url https://app.com
claude-playwright session save tablet-session --profile tablet --url https://app.com

# 3. Responsive Tests generieren
claude-playwright scaffold test ResponsiveTest --session mobile-session --test-type e2e
```

### Beispiel 3: Authentifizierung testen

```bash
# 1. Auth-spezifische Fixtures
claude-playwright scaffold fixture AuthFixture --fixture-type auth

# 2. Session für verschiedene User-Rollen
claude-playwright session save user-session --url https://app.com/login
claude-playwright session save admin-session --url https://app.com/admin/login

# 3. Authentifizierungs-Tests
claude-playwright scaffold test AuthTest --session user-session --fixture AuthFixture
claude-playwright scaffold test AdminAuthTest --session admin-session --fixture AuthFixture
```

---

## 💡 Pro-Tips

### 1. Session Management Best Practices

```bash
# Sessions regelmäßig prüfen
claude-playwright session health

# Abgelaufene Sessions automatisch bereinigen
claude-playwright session clear

# Session vor wichtigen Tests verlängern
claude-playwright session extend wichtige-session
```

### 2. Profile-Optimierung

```bash
# Profile Details anzeigen
claude-playwright profile show mobile

# Alle verfügbaren Profile auflisten
claude-playwright profile list

# Ungenutzte Profile löschen
claude-playwright profile delete unused-profile
```

### 3. Debug und Monitoring

```bash
# MCP Status prüfen
claude-playwright mcp-status

# Mit Debug-Modus
DEBUG=claude-playwright:* claude-playwright session save test-session --url https://app.com

# Status aller Komponenten
claude-playwright session health
claude-playwright profile list
claude-playwright mcp-status
```

---

## 🔧 Schnelle Problemlösungen

### Session funktioniert nicht

```bash
# 1. Session-Status prüfen
claude-playwright session list

# 2. Neue Session erstellen falls abgelaufen
claude-playwright session save neue-session --url https://app.com

# 3. Session in Test laden
const storageState = await sessionManager.loadSession('neue-session');
```

### Profile nicht gefunden

```bash
# 1. Standard-Profile installieren
claude-playwright profile setup

# 2. Verfügbare Profile prüfen
claude-playwright profile list

# 3. Custom Profile erstellen
claude-playwright profile create mein-profil --device desktop
```

### MCP Integration Probleme

```bash
# 1. MCP neu konfigurieren
claude-playwright configure-mcp

# 2. Claude Code neu starten
# (Application neu starten)

# 3. Status prüfen
claude-playwright mcp-status
```

---

## 📚 Nächste Schritte

Nach dem Quick Start:

1. **Vertiefen**: Lesen Sie den [vollständigen TEST_GUIDE.md](./TEST_GUIDE.md)
2. **Beispiele**: Schauen Sie in das [examples/](./examples/) Verzeichnis
3. **API**: Nutzen Sie die [API Dokumentation](./docs/api.md)
4. **Erweitern**: Erstellen Sie eigene Templates und Workflows

---

## ⚡ Cheat Sheet - Wichtigste Commands

```bash
# Projekt Setup
claude-playwright init
claude-playwright profile setup

# Session Management
claude-playwright session save NAME --url URL
claude-playwright session list
claude-playwright session health
claude-playwright session extend NAME

# Code Generation  
claude-playwright scaffold page PageName --url URL
claude-playwright scaffold test TestName --session SESSION

# Status & Debug
claude-playwright mcp-status
claude-playwright profile list
```

**Zeit vom Start bis zum ersten Test: < 5 Minuten!** 🎉