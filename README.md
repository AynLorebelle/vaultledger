# VaultLedger

**100% Offline-First Personal Finance & Expense Tracker Desktop App**

VaultLedger gives you complete local ownership of your finances—zero subscriptions, zero mandatory cloud accounts, and zero telemetry—paired with modern interactive visualizations and keyboard-first speed.

## Key Features (v1.1.0)

- **Clean Tactile Finance UI (Light & Dark Modes)**: Warm alabaster ledger paper & obsidian charcoal surfaces, hairline tactile borders, strict `tabular-nums`, WCAG AA contrast, visible focus states, and `prefers-reduced-motion` support with zero external font CDNs.
- **100% Local & Offline-First**: Runs natively as a Windows/macOS/Linux desktop app with atomic local vault storage, automatic rolling backups, and external local receipt storage—plus an offline-capable PWA web version.
- **Financial Health Score (0–100 Interactive Breakdown)**: Live 5-pillar local health grade (*Savings Rate*, *Budget Adherence*, *Emergency Runway*, *Debt Ratio*, and *Fixed-Cost Ratio*) with expandable explanations and 1-click drill-down actions.
- **"Ask Your Vault" (100% Offline Natural-Language Q&A)**: Ask plain-English questions in the Dashboard or Command Palette (`Ctrl+K`)—like *"How much did I spend on dining this month?"*, *"Compare groceries vs last month"*, *"Top 5 merchants"*, or *"Total subscriptions"*—and get instant local answer cards with click-to-filter drill-downs.
- **12-Month & 5-Year Net Worth & Cashflow Forecaster**: Interactive Scenario Lab with sliders for income delta, expense reduction, and expected annual return (compounded monthly on positive net worth), plus one-time and recurring financial milestone events.
- **Offline Multi-Currency FX Helper & Inline Converter**: Manage 8 currencies (`USD`, `PHP`, `EUR`, `GBP`, `JPY`, `CAD`, `AUD`, `SGD`) with an editable local exchange rate table, automatic base-currency rebasing, quick currency converter, and inline foreign-currency conversion inside Quick Add (`N`).
- **Interactive Cashflow Sankey Diagram**: Trace *Income → Net Pool → Needs / Wants / Savings → Top Categories* with hover path highlighting and click-to-drill-down filtering.
- **Executive Cockpit & Proactive Local Insights**: Track *Safe-to-Spend*, *Net Cashflow*, *Savings Rate*, *Daily Burn-Rate Forecast*, *Net Worth*, and a GitHub-style *Spending Heatmap Calendar*.
- **Zero-Friction Expense Entry (`N` / `Ctrl+K`) & Upgraded Multi-Row Batch Actions**: Natural-language quick entry (`"Coffee 5.50 dining #work"`), inline math calculator (`12.50 + 4.25`), split transactions, refund offsets, local receipt attachments, Shift+Click range selection, sticky batch action bar (Mark Reviewed/Unreviewed, Change Category, Move Account, Add Tag), and inline 2-step Bulk Delete with 1-click Undo.
- **Smart CSV & OFX/QFX Bank Importer**: Visual column mapping wizard, saved bank presets, automatic duplicate detection, and auto-categorization rules with rule suggestions.
- **Flexible Monthly Budgets & What-If Simulator**: Category budgets with optional envelope rollover and interactive sliders to model monthly & annual savings impact.
- **Recurring Bills & Subscriptions Calendar**: Track renewals, detect subscription creep, view upcoming due dates on an interactive calendar, and log payments in one click.
- **Savings Goals & Debt Payoff Planner**: Compare **Snowball vs. Avalanche** payoff strategies with an interactive extra-payment slider and projected debt-free timeline.
- **Privacy & Security**: Optional local passcode vault lock, `Shift+P` Privacy Mask blur, and **AES-256-GCM password-encrypted `.vledger`** backup & restore.

## Live Web App & Download Portal

Try VaultLedger immediately in your browser (offline-capable PWA) or download the native desktop app:

- **Live Web Portal (Vercel)**: [https://vaultledger-zeta.vercel.app](https://vaultledger-zeta.vercel.app)
- **Desktop Releases (GitHub)**: [https://github.com/AynLorebelle/vaultledger/releases](https://github.com/AynLorebelle/vaultledger/releases)

- **Windows**: `VaultLedger-*-win-x64-setup.exe` (NSIS Installer) or `VaultLedger-*-win-x64-portable.exe` (Portable)
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
