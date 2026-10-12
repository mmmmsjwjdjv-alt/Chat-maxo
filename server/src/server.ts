import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db/database.js';
import { bootstrapOwnerAccount } from './services/auth.js';
import { wsManager } from './websocket.js';
import { authRouter } from './routes/authRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { legacyRouter } from './routes/legacyRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration - allow all in development / configurable for production
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'MAXO CHAT Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/legacy', legacyRouter);

// Serve static web app if available
const webDistPath = path.resolve(process.cwd(), '..', 'web', 'dist');
if (fs.existsSync(webDistPath)) {
  console.log('[SERVER] Serving static web frontend from:', webDistPath);
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER ERROR]:', err);
  res.status(500).json({ error: 'خطای غیرمنتظره در سرور رخ داده است' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  try {
    console.log('[SERVER] Initializing MAXO CHAT Database...');
    await db.init();

    console.log('[SERVER] Bootstrapping Owner Account...');
    await bootstrapOwnerAccount();

    console.log('[SERVER] Initializing WebSocket Server...');
    wsManager.init(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(`🚀 MAXO CHAT Server running on http://0.0.0.0:${PORT}`);
      console.log(`📡 WebSocket endpoint: ws://0.0.0.0:${PORT}/ws`);
      console.log(`🩺 Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`👑 Initial Owner: MAXO (Password configured via BOOTSTRAP_OWNER_PASSWORD)`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, server };
