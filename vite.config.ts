import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function localGroqApiPlugin(): Plugin {
  return {
    name: 'aynlytics-local-groq-api',
    configureServer(server) {
      server.middlewares.use('/api/groq-chat', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        const env = loadEnv('development', process.cwd(), '');
        const apiKey =
          (req.headers['x-groq-api-key'] as string) ||
          env.GROQ_API_KEY ||
          process.env.GROQ_API_KEY ||
          '';

        if (!apiKey) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'GROQ_API_KEY_NOT_CONFIGURED' }));
          return;
        }

        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(rawBody || '{}');
            const model = parsed.model || 'openai/gpt-oss-120b';
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: parsed.messages || [],
                temperature: 0.45,
                max_tokens: 900,
              }),
            });
            const data = (await groqRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
              model?: string;
              error?: { message?: string };
            };
            res.statusCode = groqRes.status;
            res.setHeader('Content-Type', 'application/json');
            if (groqRes.ok && data?.choices?.[0]?.message?.content) {
              res.end(
                JSON.stringify({
                  reply: data.choices[0].message.content,
                  modelUsed: data.model || model,
                  source: 'groq-cloud',
                })
              );
            } else {
              res.end(JSON.stringify({ error: data?.error?.message || 'Groq error' }));
            }
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Local proxy error',
              })
            );
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react(), tailwindcss(), localGroqApiPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
});
