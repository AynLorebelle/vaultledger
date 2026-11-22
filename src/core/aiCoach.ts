import type { AiChatMessage, AynieeeTone, UserProfile, VaultData } from '../types/finance';
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
    id: 'openai/gpt-oss-120b',
    label: 'Groq GPT-OSS 120B',
    badge: 'Recommended, deep financial advice',
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'Groq GPT-OSS 20B',
    badge: 'Fast responses',
  },
  {
    id: 'qwen/qwen3.8-27b',
    label: 'Groq Qwen 3.8 27B',
    badge: 'Structured analysis',
  },
];

export interface AynieeeToneOption {
  id: AynieeeTone;
  label: string;
  description: string;
  systemInstruction: string;
}

export const AYNIEEE_TONE_OPTIONS: AynieeeToneOption[] = [
  {
    id: 'conyo_bestie',
    label: 'Conyo Taglish',
    description: 'Direct Conyo Taglish advice that highlights wins and flags overspending',
    systemInstruction:
      'Speak in witty, supportive Conyo Taglish (mixing English and Tagalog naturally, e.g. "Real talk...", "Your savings rate is solid!", "Chill muna sa shopping"). Do not use emojis. Keep financial numbers sharp and accurate.',
  },
  {
    id: 'gentle_coach',
    label: 'Plain English Coach',
    description: 'Calm, clear financial guidance in plain English',
    systemInstruction:
      'Speak in warm, clear plain English without emojis. Explain financial concepts simply step by step.',
  },
  {
    id: 'strict_cfo',
    label: 'Direct CFO',
    description: 'Analytical financial advisor focused on cashflow and runway',
    systemInstruction:
      'Speak like a direct, analytical CFO without emojis. Lead with bottom-line numbers, highlight risks immediately, and give clear capital-allocation steps.',
  },
];

export const AI_COACH_STARTER_PROMPTS: string[] = [
  'Build a 30-day savings plan from my cashflow',
  'Where am I overspending this month?',
  'How can I take #1 in our Friend Savings Squad?',
  'Snowball vs Avalanche for my debt?',
  'Is my emergency fund runway safe?',
  'Check my 50/30/20 Needs, Wants, and Savings split',
];

export function getEffectiveProfile(vault: VaultData): UserProfile {
  const rawAvatar = vault.settings.profile?.avatarEmoji || 'AL';
  const cleanAvatar = /^[a-zA-Z0-9_-]{1,20}$/.test(rawAvatar.trim()) ? rawAvatar.trim() : 'AL';
  return {
    displayName: vault.settings.profile?.displayName || 'Ayn Lorebelle',
    tagline: vault.settings.profile?.tagline || 'Smart Saver & Co-Op Squad Leader',
    avatarEmoji: cleanAvatar,
    clayAccent: vault.settings.profile?.clayAccent || '#FDBCB4',
    monthlySavingsGoalPct: vault.settings.profile?.monthlySavingsGoalPct ?? 25,
    aynieeeTone: vault.settings.profile?.aynieeeTone || 'conyo_bestie',
  };
}

export function buildVaultFinancialContext(vault: VaultData): string {
  const cur = vault.settings.baseCurrency;
  const profile = getEffectiveProfile(vault);
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
    `=== AYNLYTICS LIVE VAULT SNAPSHOT FOR ${profile.displayName.toUpperCase()} (Base Currency: ${cur}) ===`,
    `- User Profile: ${profile.displayName} (${profile.tagline}) | Monthly Savings Goal Target: ${profile.monthlySavingsGoalPct}%`,
    `- Safe-to-Spend: ${formatCurrency(kpis.safeToSpend, cur)}`,
    `- Total Net Worth: ${formatCurrency(kpis.totalNetWorth, cur)} (Liquid Cash: ${formatCurrency(kpis.liquidCash, cur)}, Total Debt: ${formatCurrency(kpis.totalDebt, cur)})`,
    `- This Month Cashflow: Income ${formatCurrency(kpis.periodIncome, cur)} | Expenses ${formatCurrency(kpis.periodExpenses, cur)} | Net ${formatCurrency(kpis.netCashflow, cur)} | Actual Savings Rate ${kpis.savingsRate.toFixed(1)}% (vs ${profile.monthlySavingsGoalPct}% target)`,
    `- Daily Burn Rate: ${formatCurrency(kpis.dailyBurnRate, cur)}/day (Projected Month-End Expense: ${formatCurrency(kpis.projectedMonthEndExpense, cur)})`,
    `- Financial Health Score: ${health.score}/100 (Grade ${health.grade}) - ${health.summary}`,
    `  * Pillars: ${health.metrics.map((m) => `${m.label}: ${m.displayValue} (${m.status})`).join(' | ')}`,
    `- Top Spending Categories This Month: ${categories.map((c) => `${c.categoryName}: ${formatCurrency(c.spent, cur)}${c.effectiveBudget > 0 ? ` / ${formatCurrency(c.effectiveBudget, cur)} budget (${c.percentUsed}%)` : ''}`).join('; ')}`,
    `- Over-Budget Alerts: ${overBudget.length > 0 ? overBudget.map((c) => `${c.categoryName} is over by ${formatCurrency(c.spent - c.effectiveBudget, cur)}`).join(', ') : 'None'}`,
    `- Recurring Subscriptions & Bills: ${formatCurrency(recurring.subscriptionMonthly, cur)}/mo across active subscriptions (${recurring.upcomingSoon.length} due in next 7 days)`,
  ];

  if (primarySquad && squadBoard) {
    lines.push(
      `- Active Friend Savings Squad: "${primarySquad.name}" (Room ${primarySquad.roomCode}) - Saved ${formatCurrency(squadBoard.totalSaved, primarySquad.currency)} / ${formatCurrency(squadBoard.targetAmount, primarySquad.currency)} (${squadBoard.progressPercent.toFixed(1)}%)`,
      `  * Friend Ownership Shares: ${squadBoard.entries.map((e) => `#${e.rank} ${e.member.name}: ${formatCurrency(e.totalContributed, primarySquad.currency)} (${e.sharePercent.toFixed(1)}% share of pot)`).join(' | ')}`
    );
  }

  return lines.join('\n');
}

export function generateLocalFinancialAdvice(userPrompt: string, vault: VaultData): string {
  const q = userPrompt.toLowerCase();
  const cur = vault.settings.baseCurrency;
  const profile = getEffectiveProfile(vault);
  const isConyo = profile.aynieeeTone === 'conyo_bestie';
  const greeting = isConyo
    ? `Hi **${profile.displayName}**, Aynieee here. Let's check your numbers:`
    : `Hi **${profile.displayName}**, here is Aynieee's review of your vault:`;

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
          `- #${e.rank} **${e.member.name}**: ${formatCurrency(e.totalContributed, primarySquad.currency)} (**${e.sharePercent.toFixed(1)}% share**, ${e.contributionCount} deposits)`
      )
      .join('\n');

    const catchUpAdvice =
      leader && second
        ? isConyo
          ? `Real talk: **${leader.member.name}** holds the #1 Top Saver spot by **${formatCurrency(leader.leadOverNext, primarySquad.currency)}** (+${leader.shareGapPercent.toFixed(1)}% share lead over ${second.member.name}). Para ma-overtake ni ${second.member.name} ang #1 spot today, mag-deposit lang ng at least **${formatCurrency(leader.leadOverNext + 50, primarySquad.currency)}** into the pot.`
          : `Right now, **${leader.member.name}** holds the #1 Top Saver spot by **${formatCurrency(leader.leadOverNext, primarySquad.currency)}** (+${leader.shareGapPercent.toFixed(1)}% share lead over ${second.member.name}). To take #1 today, ${second.member.name} needs a deposit of at least **${formatCurrency(leader.leadOverNext + 50, primarySquad.currency)}**.`
        : 'Add a deposit in the Friend Squads tab to start the ownership share leaderboard.';

    return [
      greeting,
      '',
      `Live leaderboard for **${primarySquad.name}** (Room \`${primarySquad.roomCode}\`):`,
      `**Pot Progress**: ${formatCurrency(squadBoard.totalSaved, primarySquad.currency)} / ${formatCurrency(squadBoard.targetAmount, primarySquad.currency)} (${squadBoard.progressPercent.toFixed(1)}% funded, ${formatCurrency(squadBoard.remainingAmount, primarySquad.currency)} remaining)`,
      '',
      '**Ownership Shares**:',
      shareSummary,
      '',
      `**Next Step**: ${catchUpAdvice} Your Safe-to-Spend is **${formatCurrency(kpis.safeToSpend, cur)}**, so you can move **${formatCurrency(Math.max(100, Math.round(kpis.netCashflow * 0.25)), cur)}** this week without straining upcoming bills.`,
    ].join('\n');
  }

  // 2. Debt Payoff (Snowball vs Avalanche)
  if (/debt|snowball|avalanche|loan|credit card|apr|interest/i.test(q)) {
    const debtAccounts = vault.accounts.filter(
      (a) => !a.archived && (a.type === 'credit' || a.type === 'loan' || a.openingBalance < 0)
    );
    return [
      greeting,
      '',
      `**Debt Payoff Plan (Total Debt: ${formatCurrency(kpis.totalDebt, cur)})**:`,
      `1. **Avalanche Method (Lowest Interest Cost)**: Put extra payments toward your highest-APR debt first while paying minimums on lower-rate loans.`,
      `2. **Snowball Method (Fastest Account Closure)**: Clear the smallest balance first to remove a monthly bill quickly, then roll that payment into the next balance.`,
      '',
      `**Recommendation for ${profile.displayName}**:`,
      `- Your monthly net cashflow is **${formatCurrency(kpis.netCashflow, cur)}** (**${kpis.savingsRate.toFixed(1)}%** savings rate vs your **${profile.monthlySavingsGoalPct}%** target) across **${debtAccounts.length} liability account(s)**.`,
      `- Allocate **${formatCurrency(Math.max(150, Math.round(Math.max(0, kpis.netCashflow) * 0.3)), cur)}/month** extra into the **Avalanche** simulator in *Goals & Debt* to cut interest costs and raise your Health Score above **${health.score}/100**.`,
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
      greeting,
      '',
      `**30-Day Money & Savings Plan (Health Score: ${health.score}/100, Grade ${health.grade})**:`,
      `- **Cashflow**: Income is **${formatCurrency(kpis.periodIncome, cur)}** and expenses are **${formatCurrency(kpis.periodExpenses, cur)}** this month, leaving **${formatCurrency(kpis.netCashflow, cur)}** net cashflow (**${kpis.savingsRate.toFixed(1)}% savings rate** vs your **${profile.monthlySavingsGoalPct}%** goal) and **${formatCurrency(kpis.safeToSpend, cur)} Safe-to-Spend**.`,
      over.length > 0
        ? `- **Over-Budget Categories**: ${over.map((c) => `**${c.categoryName}** (${formatCurrency(c.spent, cur)} spent vs ${formatCurrency(c.effectiveBudget, cur)} budget)`).join(', ')}. ${isConyo ? 'Chill muna sa category na ito for the rest of the month.' : 'Pause non-essential spending here for the rest of the month.'}`
        : `- **Budget Status**: All categories are currently within budget.`,
      topWants.length > 0
        ? `- **20% Wants Trim**: Trimming 20% from (${topWants.map((c) => `${c.categoryName}: ${formatCurrency(c.spent, cur)}`).join(', ')}) saves an extra **${formatCurrency(trimTarget, cur)}/month** (${formatCurrency(trimTarget * 12, cur)}/year).`
        : '',
      `- **Next Step**: Transfer **${formatCurrency(Math.max(150, trimTarget), cur)}** into your **${primarySquad?.name ?? 'Friend Savings Squad'}** pot to keep your #1 share lead.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // 4. Emergency fund / Runway
  if (/emergency|runway|liquid|safety net/i.test(q)) {
    const runwayPillar = health.metrics.find((m) => m.id === 'emergency_runway');
    return [
      greeting,
      '',
      `**Emergency Fund & Runway Checkup**:`,
      `- **Liquid Cash**: **${formatCurrency(kpis.liquidCash, cur)}** across checking, savings, and cash wallets.`,
      `- **Emergency Runway**: **${runwayPillar?.displayValue ?? 'N/A'}** (${runwayPillar?.explanation ?? 'Target 6+ months of core expenses'}).`,
      `- **Next Step**: Keep 6 months of essential expenses in high-yield savings, and allocate surplus cash into your Friend Savings Squad or investment goals.`,
    ].join('\n');
  }

  // 5. Fallback
  const vaultAns = askVault(userPrompt, vault);
  const topLines = [
    greeting,
    '',
    `**${vaultAns.headline}** (${vaultAns.periodLabel})`,
    vaultAns.summary,
  ];
  if (vaultAns.rows.length > 0) {
    topLines.push(
      '',
      ...vaultAns.rows
        .slice(0, 4)
        .map((r) => `- **${r.label}**: ${formatCurrency(r.amount, cur)}${r.sublabel ? ` (${r.sublabel})` : ''}`)
    );
  }
  topLines.push(
    '',
    `**Summary for ${profile.displayName}**: Financial Health Score is **${health.score}/100 (${health.grade})** with a **${kpis.savingsRate.toFixed(1)}% savings rate** (target: **${profile.monthlySavingsGoalPct}%**) and **${formatCurrency(kpis.safeToSpend, cur)} Safe-to-Spend**.`
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
    model = 'openai/gpt-oss-120b',
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
      modelUsed: 'Aynieee Local Engine (Offline)',
    };
  }

  const profile = getEffectiveProfile(vault);
  const toneOption =
    AYNIEEE_TONE_OPTIONS.find((t) => t.id === profile.aynieeeTone) ??
    AYNIEEE_TONE_OPTIONS[0];

  const systemPrompt = [
    `Your name is **Aynieee**, the financial advisor inside AYNLYTICS 2.0 (powered by Groq).`,
    `You are advising **${profile.displayName}** (${profile.tagline}).`,
    toneOption.systemInstruction,
    'Do not use emojis. Keep answers clear and concise (3-5 short bullet points), cite exact numbers in the user’s active base currency from the live vault snapshot below, and end with 1 concrete next action.',
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
        modelUsed: 'Aynieee Local Engine',
        errorHint: data?.error?.message || `Groq API returned HTTP ${groqRes.status}`,
      };
    } catch (err) {
      return {
        reply: generateLocalFinancialAdvice(lastUserMsg, vault),
        source: 'local-offline',
        modelUsed: 'Aynieee Local Engine',
        errorHint: err instanceof Error ? err.message : 'Network error calling Groq',
      };
    }
  }

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
    modelUsed: 'Aynieee Smart Advisor (Offline / Local)',
    errorHint: 'GROQ_KEY_OPTIONAL',
  };
}
