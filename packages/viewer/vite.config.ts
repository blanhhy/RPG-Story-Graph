import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 解析在 Node 侧执行（Vite dev 中间件）：前端只消费 JSON，
// 避免浏览器加载 core 的 fs/rpgrt 依赖。
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'storygraph-api',
      configureServer(server) {
        server.middlewares.use('/api/analyze', async (req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', async () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
              const dir = body.dir as string;
              if (!dir) { res.statusCode = 400; res.end(JSON.stringify({ error: '缺少 dir' })); return; }
              const { analyzeGame } = await server.ssrLoadModule('@storygraph/core');
              const t0 = Date.now();
              const graph = analyzeGame(dir, { simplify: true });
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ms: Date.now() - t0, graph }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e?.message ?? e), stack: String(e?.stack ?? '') }));
            }
          });
        });
      },
    },
  ],
  server: { port: 5173 },
  ssr: { noExternal: ['@storygraph/core', 'rpgrt'] },
});