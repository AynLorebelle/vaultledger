import { describe, expect, it, vi } from 'vitest';
import {
  AI_COACH_STARTER_PROMPTS,
  GROQ_MODELS,
  buildVaultFinancialContext,
  generateLocalFinancialAdvice,
  sendGroqAdvisorMessage,
} from './aiCoach';
import { createSampleVault } from './seedData';

describe('aiCoach: Groq Online AI Financial Advisor & Offline Fallback', () => {
  it('exports Groq models and starter financial coaching prompts', () => {
    expect(GROQ_MODELS.length).toBeGreaterThanOrEqual(2);
    expect(GROQ_MODELS[0].id).toBe('openai/gpt-oss-120b');
    expect(AI_COACH_STARTER_PROMPTS.length).toBeGreaterThanOrEqual(5);
  });

  it('builds a rich financial context summary from the user vault', () => {
    const vault = createSampleVault();
    const ctx = buildVaultFinancialContext(vault);
    expect(ctx).toContain('Safe-to-Spend');
    expect(ctx).toContain('Financial Health Score');
    expect(ctx).toContain('Tokyo Besties Trip 2027');
    expect(ctx).toContain('52.1%');
  });

  it('calls Groq chat completions endpoint when online with a Groq API key', async () => {
    const vault = createSampleVault();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Based on your 44.1% savings rate and $31,063 Safe-to-Spend, trim Shopping by $20/mo and put $500 into your Tokyo Besties Trip pot!',
            },
          },
        ],
      }),
    });

    const res = await sendGroqAdvisorMessage({
      messages: [{ id: 'm1', role: 'user', content: 'How can I save more this month?', createdAt: '2026-11-22T10:00:00Z' }],
      vault,
      apiKey: 'gsk_test_mock_key_1234567890',
      model: 'openai/gpt-oss-120b',
      isOnline: true,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.source).toBe('groq-cloud');
    expect(res.modelUsed).toBe('openai/gpt-oss-120b');
    expect(res.reply).toContain('44.1% savings rate');
  });

  it('falls back seamlessly to local financial advisor when offline', async () => {
    const vault = createSampleVault();
    const res = await sendGroqAdvisorMessage({
      messages: [{ id: 'm1', role: 'user', content: 'How can I overtake #1 in our Friend Savings Squad?', createdAt: '2026-11-22T10:00:00Z' }],
      vault,
      isOnline: false,
    });

    expect(res.source).toBe('local-offline');
    expect(res.reply).toContain('Tokyo Besties Trip 2027');
    expect(res.reply.length).toBeGreaterThan(60);

    const debtAdvice = generateLocalFinancialAdvice('Snowball vs Avalanche for my debt?', vault);
    expect(debtAdvice).toContain('Avalanche');
    expect(debtAdvice).toContain('Snowball');
  });
});
