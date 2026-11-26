import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { initializeDatabase } from './server/db/database.ts';
import apiRouter from './server/routes/api.ts';
import { seedRahulDemoIfEmpty } from './server/services/seedDemo.ts';

const PORT = 3000;

async function startServer() {
  initializeDatabase();
  seedRahulDemoIfEmpty(false);

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', apiRouter);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClinicalTrust AI server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
