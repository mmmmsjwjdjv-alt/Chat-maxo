import { Router, Request, Response } from 'express';
import { authenticateMiddleware } from './authRoutes.js';
import { inspectAndSyncLegacyJson } from '../services/legacyJsonSync.js';

export const legacyRouter = Router();

legacyRouter.use(authenticateMiddleware);

// Sync from legacy JSON endpoint (Owner only)
legacyRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    if (actor.role !== 'owner') {
      return res.status(403).json({ error: 'همگام‌سازی از منبع قدیمی تنها برای مالک سیستم مجاز است' });
    }

    const report = await inspectAndSyncLegacyJson(actor);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'خطا در ارتباط با منبع قدیمی' });
  }
});
