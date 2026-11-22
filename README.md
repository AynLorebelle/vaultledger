# VaultLedger

**100% Offline-First Personal Finance & Expense Tracker Desktop App**

VaultLedger gives you complete local ownership of your finances—zero subscriptions, zero mandatory cloud accounts, and zero telemetry—paired with modern interactive visualizations and keyboard-first speed.

## Key Features

- **100% Local & Offline-First**: Runs natively as a Windows/macOS/Linux desktop app with atomic local vault storage, automatic rolling backups, and external local receipt storage—plus an offline-capable PWA web version.
- **Interactive Cashflow Sankey Diagram**: Trace *Income → Net Pool → Needs / Wants / Savings → Top Categories* with hover path highlighting and click-to-drill-down filtering.
- **Executive Cockpit & Proactive Local Insights**: Track *Safe-to-Spend*, *Net Cashflow*, *Savings Rate*, *Daily Burn-Rate Forecast*, *Net Worth*, and a GitHub-style *Spending Heatmap Calendar*.
- **Zero-Friction Expense Entry (`N` / `Ctrl+K`)**: Natural-language quick entry (`"Coffee 5.50 dining #work"`), inline math calculator (`12.50 + 4.25`), split transactions across categories, clean refund offsets, local receipt attachments, and an *Inbox Zero* review queue.
- **Smart CSV & OFX/QFX Bank Importer**: Visual column mapping wizard, saved bank presets, automatic duplicate detection, and auto-categorization rules with rule suggestions.
- **Flexible Monthly Budgets & What-If Simulator**: Category budgets with optional envelope rollover and interactive sliders to model monthly & annual savings impact.
- **Recurring Bills & Subscriptions Calendar**: Track renewals, detect subscription creep, view upcoming due dates on an interactive calendar, and log payments in one click.
- **Savings Goals & Debt Payoff Planner**: Compare **Snowball vs. Avalanche** payoff strategies with an interactive extra-payment slider and projected debt-free timeline.
- **Privacy & Security**: Optional local passcode vault lock, `Shift+P` Privacy Mask blur, and **AES-256-GCM password-encrypted `.vledger`** backup & restore.

## Download Desktop App

Download the latest native desktop installers directly from [GitHub Releases](https://github.com/AynLorebelle/vaultledger/releases):

- **Windows**: `VaultLedger-*-win-x64-nsis.exe` (Installer) or `VaultLedger-*-win-x64-portable.exe` (Portable)
- **macOS**: `VaultLedger-*-mac-*.dmg`
- **Linux**: `VaultLedger-*-linux-*.AppImage`

## Development

```bash
npm install
npm run dev           # Start web dev server
npm run dev:electron  # Start Electron desktop app in dev mode
npm run typecheck     # Run TypeScript checks
npm test              # Run Vitest unit test suite
npm run build         # Build production web / PWA bundle
npm run dist:win      # Package Windows NSIS & Portable .exe installers
```

## Automated CI/CD

- **CI (`.github/workflows/ci.yml`)**: Type-check, unit tests, and build on every push & PR.
- **Desktop Releases (`.github/workflows/release.yml`)**: Pushing a version tag (`v1.0.0`) automatically builds Windows `.exe`, macOS `.dmg`, and Linux `.AppImage` artifacts and publishes a GitHub Release.
- **Web Portal (`.github/workflows/deploy-vercel.yml`)**: Automatically deploys the offline-capable PWA & Download Portal to Vercel.
