import { Router, Request, Response } from 'express';
import { authenticateMiddleware } from './authRoutes.js';
import {
  createMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  togglePinMessage,
} from '../services/chat.js';
import { db } from '../db/database.js';
import { wsManager } from '../websocket.js';

export const chatRouter = Router();

// Publicly read chat status and welcome message
chatRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const settings = await db.getSettings();
    const onlineCount = wsManager.getOnlineCount();
    return res.json({
      isChatClosed: settings.isChatClosed,
      closedReason: settings.closedReason,
      welcomeMessage: settings.welcomeMessage,
      onlineCount,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در دریافت وضعیت چت' });
  }
});

// Get recent messages (requires auth or public read)
chatRouter.get('/messages', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const messages = await db.getRecentMessages(limit);
    return res.json({ messages });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در بارگذاری پیام‌ها' });
  }
});

// Send new message
chatRouter.post('/messages', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { content, replyToId } = req.body;

    const message = await createMessage({ user, content, replyToId });

    // Real-time broadcast to all connected WebSocket clients
    wsManager.broadcast({
      type: 'CHAT_MESSAGE_NEW',
      data: message,
      timestamp: message.createdAt,
    });

    return res.status(201).json({ message });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در ارسال پیام' });
  }
});

// Edit message
chatRouter.put('/messages/:id', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const messageId = req.params.id;
    const { content } = req.body;

    const updated = await editMessage({ messageId, user, newContent: content });

    wsManager.broadcast({
      type: 'CHAT_MESSAGE_EDIT',
      data: updated,
      timestamp: updated.updatedAt,
    });

    return res.json({ message: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در ویرایش پیام' });
  }
});

// Delete message
chatRouter.delete('/messages/:id', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const messageId = req.params.id;

    const deleted = await deleteMessage({ messageId, user });

    wsManager.broadcast({
      type: 'CHAT_MESSAGE_DELETE',
      data: deleted,
      timestamp: deleted.updatedAt,
    });

    return res.json({ message: deleted });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در حذف پیام' });
  }
});

// React to message
chatRouter.post('/messages/:id/reaction', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const messageId = req.params.id;
    const { emoji } = req.body;

    const updated = await toggleMessageReaction({ messageId, user, emoji });

    wsManager.broadcast({
      type: 'CHAT_MESSAGE_REACTION',
      data: updated,
      timestamp: updated.updatedAt,
    });

    return res.json({ message: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در ثبت واکنش' });
  }
});

// Pin or unpin message
chatRouter.post('/messages/:id/pin', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const messageId = req.params.id;

    const updated = await togglePinMessage({ messageId, user });

    wsManager.broadcast({
      type: 'CHAT_MESSAGE_PIN',
      data: updated,
      timestamp: updated.updatedAt,
    });

    return res.json({ message: updated });
  } catch (err: any) {
    return res.status(403).json({ error: err.message || 'خطا در تغییر وضعیت پین' });
  }
});
