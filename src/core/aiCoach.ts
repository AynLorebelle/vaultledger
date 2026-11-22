import type { AiChatMessage, VaultData } from '../types/finance';
import {
  computeCategorySpend,
  computeDashboardKPIs,
  computeRecurringSummary,
  formatCurrency,
} from './analytics';
import { askVault } from './askVault';
import { computeFinancialHealthScore } from './healthScore';
import { computeSquadLeaderboard, createDefaultSavingsSquads } from './savingsSquad';

export interface GroqModelOption {
  id: string;
  label: string;
  badge: string;
}

export const GROQ_MODELS: GroqModelOption[] = [
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    badge: 'Recommended • Deep Financial Advice',
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    badge: 'Ultra-Fast • Instant Answers',
  },
  {
    id: 'gemma2-9b-it',
    label: 'Gemma 2 9B IT',
    badge: 'Compact • Structured Tips',
  },
];

export const AI_COACH_STARTER_PROMPTS: string[] = [
  'Build me a 30-day savings plan based on my current cashflow',
  'Where am I overspending this month and how much can I cut?',
  'How can I overtake #1 in our Friend Savings Squad?',
  'Snowball vs Avalanche: what is the fastest way to clear my debt?',
  'Is my emergency fund runway safe right now?',
  'Analyze my 50/30/20 Needs, Wants & Savings split',
];

export function buildVaultFinancialContext(vault: VaultData): string {
  const cur = vault.settings.baseCurrency;
  const kpis = computeDashboardKPIs(vault, 'this_month');
  const health = computeFinancialHealthScore(vault);
  const categories = computeCategorySpend(vault, 'this_month')
    .filter((c) => c.spent > 0 || c.effectiveBudget > 0)
    .slice(0, 6);
  const recurring = computeRecurringSummary(vault.recurringBills);
  const squads =
    Array.isArray(vault.savingsSquads) && vault.savingsSquads.length > 0
      ? vault.savingsSquads
      : createDefaultSavingsSquads(cur);
  const primarySquad = squads[0];
  const squadBoard = primarySquad ? computeSquadLeaderboard(primarySquad) : null;

  const overBudget = categories.filter(
    (c) => c.effectiveBudget > 0 && c.spent > c.effectiveBudget
  );

  const lines: string[] = [
    `=== AYNLYTICS LIVE VAULT SNAPSHOT (Base Currency: ${cur}) ===`,
    `- Safe-to-Spend: ${formatCurrency(kpis.safeToSpend, cur)}`,
    `- Total Net Worth: ${formatCurrency(kpis.totalNetWorth, cur)} (Liquid Cash: ${formatCurrency(kpis.liquidCash, cur)}, Total Debt: ${formatCurrency(kpis.totalDebt, cur)})`,
    `- This Month Cashflow: Income ${formatCurrency(kpis.periodIncome, cur)} | Expenses ${formatCurrency(kpis.periodExpenses, cur)} | Net ${formatCurrency(kpis.netCashflow, cur)} | Savings Rate ${kpis.savingsRate.toFixed(1)}%`,
    `- Daily Burn Rate: ${formatCurrency(kpis.dailyBurnRate, cur)}/day (Projected Month-End Expense: ${formatCurrency(kpis.projectedMonthEndExpense, cur)})`,
    `- Financial Health Score: ${health.score}/100 (Grade ${health.grade}) — ${health.summary}`,
    `  * Pillars: ${health.metrics.map((m) => `${m.label}: ${m.displayValue} (${m.status})`).join(' | ')}`,
    `- Top Spending Categories This Month: ${categories.map((c) => `${c.categoryName}: ${formatCurrency(c.spent, cur)}${c.effectiveBudget > 0 ? ` / ${formatCurrency(c.effectiveBudget, cur)} budget (${c.percentUsed}%)` : ''}`).join('; ')}`,
    `- Over-Budget Alerts: ${overBudget.length > 0 ? overBudget.map((c) => `${c.categoryName} is over by ${formatCurrency(c.spent - c.effectiveBudget, cur)}`).join(', ') : 'None — all budgeted categories are currently within limit'}`,
    `- Recurring Subscriptions & Bills: ${formatCurrency(recurring.subscriptionMonthly, cur)}/mo across active subscriptions (${recurring.upcomingSoon.length} due in next 7 days)`,
  ];

  if (primarySquad && squadBoard) {
    lines.push(
      `- Active Friend Savings Squad: "${primarySquad.name}" (Room ${primarySquad.roomCode}) — Saved ${formatCurrency(squadBoard.totalSaved, primarySquad.currency)} / ${formatCurrency(squadBoard.targetAmount, primarySquad.currency)} (${squadBoard.progressPercent.toFixed(1)}%)`,
      `  * Friend Ownership Shares: ${squadBoard.entries.map((e) => `#${e.rank} ${e.member.name}: ${formatCurrency(e.totalContributed, primarySquad.currency)} (${e.sharePercent.toFixed(1)}% share of pot)`).join(' | ')}`
    );
  }

  return lines.join('\n');
}

export function generateLocalFinancialAdvice(userPrompt: string, vault: VaultData): string {
  const q = userPrompt.toLowerCase();
  const cur = vault.settings.baseCurrency;
  const kpis = computeDashboardKPIs(vault, 'this_month');
  const health = computeFinancialHealthScore(vault);
  const categories = computeCategorySpend(vault, 'this_month');
  const squads =
    Array.isArray(vault.savingsSquads) && vault.savingsSquads.length > 0
      ? vault.savingsSquads
      : createDefaultSavingsSquads(cur);
  const primarySquad = squads[0];
  const squadBoard = primarySquad ? computeSquadLeaderboard(primarySquad) : null;

  // 1. Friend Savings Squad / Share Leaderboard questions
  if (/squad|friend|overtake|share|top saver|tokyo|bestie|beat|lead/i.test(q) && primarySquad && squadBoard) {
    const leader = squadBoard.entries[0];
    const second = squadBoard.entries[1];
    const shareSummary = squadBoard.entries
      .map(
        (e) =>
          `• #${e.rank} ${e.member.name}: ${formatCurrency(e.totalContributed, primarySquad.currency)} (${e.sharePercent.toFixed(1)}% share of pot across ${e.contributionCount} deposits)`
      )
      .join('\n');

    const catchUpAdvice =
      leader && second
        ? `Right now, ${leader.member.name} holds the #1 Top Saver spot by ${formatCurrency(leader.leadOverNext, primarySquad.currency)} (+${leader.shareGapPercent.toFixed(1)}% share lead over ${second.member.name}). For ${second.member.name} to overtake #1 today, they need a deposit of at least ${formatCurrency(leader.leadOverNext + 50, primarySquad.currency)}.`
        : 'Add a friend deposit in the Friend Squads tab to start the ownership share leaderboard!';

    return [
      `Here is your live Friend Savings Squad breakdown for **${primarySquad.emoji} ${primarySquad.name}** (Room \`${primarySquad.roomCode}\`):`,
      '',
      `**Pot Progress**: ${formatCurrency(squadBoard.totalSaved, primarySquad.currency)} / ${formatCurrency(squadBoard.targetAmount, primarySquad.currency)} (${squadBoard.progressPercent.toFixed(1)}% funded — ${formatCurrency(squadBoard.remainingAmount, primarySquad.currency)} remaining)`,
      '',
      '**Ownership Shares**:',
      shareSummary,
      '',
      `**Coach Strategy**: ${catchUpAdvice} With your current Safe-to-Spend at ${formatCurrency(kpis.safeToSpend, cur)}, you can comfortably allocate ${formatCurrency(Math.max(100, Math.round(kpis.netCashflow * 0.25)), cur)} this week without straining upcoming bills.`,
    ].join('\n');
  }

  // 2. Debt Payoff (Snowball vs Avalanche)
  if (/debt|snowball|avalanche|loan|credit card|apr|interest/i.test(q)) {
    const debtAccounts = vault.accounts.filter(
      (a) => !a.archived && (a.type === 'credit' || a.type === 'loan' || a.openingBalance < 0)
    );
    return [
      `**Debt Payoff Strategy Analysis (Total Debt: ${formatCurrency(kpis.totalDebt, cur)})**:`,
      '',
      `1. **Avalanche Method (Mathematically Fastest & Cheapest)**: Direct all extra cash toward your highest-APR balance first (such as credit cards at ~19–22% APR) while paying minimums on lower-rate loans. This saves the most in total interest.`,
      `2. **Snowball Method (Fastest Behavioral Momentum)**: Knock out the smallest balance first to eliminate an entire monthly minimum payment quickly, then roll that payment into the next debt.`,
      '',
      `**Action Plan for Your Vault**:`,
      `• Your current monthly net cashflow is **${formatCurrency(kpis.netCashflow, cur)}** (${kpis.savingsRate.toFixed(1)}% savings rate) and you have **${debtAccounts.length} liability account(s)** tracked.`,
      `• Putting just **${formatCurrency(Math.max(150, Math.round(Math.max(0, kpis.netCashflow) * 0.3)), cur)}/month** in extra payments via the **Avalanche** method in the *Goals & Debt* tab will shave months off your payoff timeline and boost your Financial Health Score (currently **${health.score}/100**).`,
    ].join('\n');
  }

  // 3. Overspending / Budget cuts / 30-day savings plan / 50-30-20
  if (/overspend|cut|budget|save more|30-day|plan|50\/30\/20|needs|wants/i.test(q)) {
    const over = categories.filter((c) => c.effectiveBudget > 0 && c.spent > c.effectiveBudget);
    const topWants = categories
      .filter((c) => c.group === 'wants' && c.spent > 0)
      .slice(0, 3);

    const trimTarget = topWants.reduce((acc, c) => acc + Math.round(c.spent * 0.2), 0);

    return [
      `**30-Day Personal Finance & Savings Gameplan (Health Score: ${health.score}/100 • Grade ${health.grade})**:`,
      '',
      `• **Current Cashflow Position**: You earned **${formatCurrency(kpis.periodIncome, cur)}** and spent **${formatCurrency(kpis.periodExpenses, cur)}** this month, leaving **${formatCurrency(kpis.netCashflow, cur)}** net cashflow (**${kpis.savingsRate.toFixed(1)}% savings rate**) and **${formatCurrency(kpis.safeToSpend, cur)} Safe-to-Spend**.`,
      over.length > 0
        ? `• **Watch Out — Over-Budget Categories**: ${over.map((c) => `**${c.categoryName}** (${formatCurrency(c.spent, cur)} spent vs ${formatCurrency(c.effectiveBudget, cur)} limit)`).join(', ')}. Pause non-essential purchases here for the rest of the month.`
        : `• **Budget Discipline**: All budgeted categories are within limit so far—strong control!`,
      topWants.length > 0
        ? `• **Quick 20% Discretionary Trim**: Trimming 20% from your top Wants (${topWants.map((c) => `${c.categoryName}: ${formatCurrency(c.spent, cur)}`).join(', ')}) frees up **${formatCurrency(trimTarget, cur)}/month** (${formatCurrency(trimTarget * 12, cur)}/year).`
        : '',
      `• **Next Move**: Transfer **${formatCurrency(Math.max(150, trimTarget), cur)}** right on payday into your High-Yield Savings or **${primarySquad?.name ?? 'Friend Savings Squad'}** pot so it compounds before you can spend it.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // 4. Emergency fund / Runway
  if (/emergency|runway|liquid|safety net/i.test(q)) {
    const runwayPillar = health.metrics.find((m) => m.id === 'emergency_runway');
    return [
      `**Emergency Fund & Runway Assessment**:`,
      '',
      `• **Liquid Cash Available**: **${formatCurrency(kpis.liquidCash, cur)}** across your checking, savings, and cash accounts.`,
      `• **Current Runway**: **${runwayPillar?.displayValue ?? 'N/A'}** (${runwayPillar?.explanation ?? 'Target at least 6 months of essential expenses'}).`,
      `• **Recommendation**: Keep 3–6 months of core living expenses in a liquid High-Yield Savings account (~4.5% APY), and direct surplus cash above 6 months into long-term investments or your shared Friend Savings Squad goals.`,
    ].join('\n');
  }

  // 5. Fallback: combine askVault deterministic lookup + actionable financial coaching tip
  const vaultAns = askVault(userPrompt, vault);
  const topLines = [
    `**${vaultAns.headline}** (${vaultAns.periodLabel})`,
    vaultAns.summary,
  ];
  if (vaultAns.rows.length > 0) {
    topLines.push(
      '',
      ...vaultAns.rows
        .slice(0, 4)
        .map((r) => `• **${r.label}**: ${formatCurrency(r.amount, cur)}${r.sublabel ? ` (${r.sublabel})` : ''}`)
    );
  }
  topLines.push(
    '',
    `**Financial Coach Tip**: Your overall Financial Health Score is **${health.score}/100 (${health.grade})** with a **${kpis.savingsRate.toFixed(1)}% savings rate** and **${formatCurrency(kpis.safeToSpend, cur)} Safe-to-Spend**. Keep fixed costs below 50% of income and automate transfers on payday to stay ahead.`
  );
  return topLines.join('\n');
}

export async function sendGroqAdvisorMessage(params: {
  messages: AiChatMessage[];
  vault: VaultData;
  apiKey?: string;
  model?: string;
  isOnline?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{
  reply: string;
  source: 'groq-cloud' | 'local-offline';
  modelUsed: string;
  errorHint?: string;
}> {
  const {
    messages,
    vault,
    apiKey,
    model = 'llama-3.3-70b-versatile',
    isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
  } = params;

  const lastUserMsg =
    [...messages].reverse().find((m) => m.role === 'user')?.content ||
    'Give me a financial health checkup';

  if (!isOnline || !fetchImpl) {
    return {
      reply: generateLocalFinancialAdvice(lastUserMsg, vault),
      source: 'local-offline',
      modelUsed: 'AYNLYTICS Local Engine (Offline)',
    };
  }

  const systemPrompt = [
    'You are the AYNLYTICS 2.0 AI Financial Coach, powered by Groq.',
    'Give practical, encouraging, numbers-backed personal finance and expense-tracking advice.',
    'Keep answers concise (3-5 short bullet points or sections), cite exact numbers from the user’s live vault snapshot below, and suggest 1 concrete next action they can take today.',
    '',
    buildVaultFinancialContext(vault),
  ].join('\n');

  const payloadMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const cleanKey = (apiKey || '').trim();

  // Path A: Direct Groq API call when user has provided a gsk_ key
  if (cleanKey.length > 10) {
    try {
      const groqRes = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          temperature: 0.45,
          max_tokens: 900,
        }),
      });

      const data = (await groqRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        error?: { message?: string };
      };

      if (groqRes.ok && data?.choices?.[0]?.message?.content) {
        return {
          reply: data.choices[0].message.content.trim(),
          source: 'groq-cloud',
          modelUsed: data.model || model,
        };
      }

      return {
        reply: generateLocalFinancialAdvice(lastUserMsg, vault),
        source: 'local-offline',
        modelUsed: 'AYNLYTICS Local Engine',
        errorHint: data?.error?.message || `Groq API returned HTTP ${groqRes.status}`,
      };
    } catch (err) {
      return {
        reply: generateLocalFinancialAdvice(lastUserMsg, vault),
        source: 'local-offline',
        modelUsed: 'AYNLYTICS Local Engine',
        errorHint: err instanceof Error ? err.message : 'Network error calling Groq',
      };
    }
  }

  // Path B: Call Vercel serverless proxy (/api/groq-chat or https://vaultledger-zeta.vercel.app/api/groq-chat)
  const proxyEndpoints =
    typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')
      ? ['/api/groq-chat']
      : ['https://vaultledger-zeta.vercel.app/api/groq-chat'];

  for (const endpoint of proxyEndpoints) {
    try {
      const proxyRes = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: payloadMessages }),
      });

      if (proxyRes.ok) {
        const data = (await proxyRes.json()) as {
          reply?: string;
          modelUsed?: string;
        };
        if (data?.reply) {
          return {
            reply: data.reply.trim(),
            source: 'groq-cloud',
            modelUsed: data.modelUsed || model,
          };
        }
      }
    } catch {
      // Fall through to local offline advisor
    }
  }

  return {
    reply: generateLocalFinancialAdvice(lastUserMsg, vault),
    source: 'local-offline',
    modelUsed: 'AYNLYTICS Smart Advisor (Connect Groq Key for Live Llama 3.3)',
    errorHint: 'GROQ_KEY_OPTIONAL',
  };
}
