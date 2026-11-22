// Vercel Serverless Function: /api/groq-chat
// Proxies online financial coaching requests to Groq's OpenAI-compatible Chat Completions endpoint.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-groq-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const headerKey = req.headers['x-groq-api-key'];
  const apiKey =
    (typeof headerKey === 'string' && headerKey.trim()) ||
    process.env.GROQ_API_KEY ||
    process.env.Groq_Token ||
    '';

  if (!apiKey) {
    return res.status(503).json({
      error: 'GROQ_API_KEY_NOT_CONFIGURED',
      message: 'No server GROQ_API_KEY configured; paste a gsk_ key in the AYNLYTICS AI Coach drawer.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const model = body.model || 'llama-3.3-70b-versatile';
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.45,
        max_tokens: 900,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      return res.status(groqRes.status).json({
        error: data?.error?.message || `Groq API error (${groqRes.status})`,
      });
    }

    const reply = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      reply,
      modelUsed: data?.model || model,
      source: 'groq-cloud',
    });
  } catch (err) {
    return res.status(500).json({
      error: err && err.message ? err.message : 'Unexpected server error contacting Groq',
    });
  }
}
