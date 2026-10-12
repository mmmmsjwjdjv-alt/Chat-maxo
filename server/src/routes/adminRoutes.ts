import { Router, Request, Response } from 'express';
import { authenticateMiddleware } from './authRoutes.js';
import {
  promoteToAdmin,
  demoteAdmin,
  updateAdminPermissions,
  toggleSuspendUser,
  toggleGlobalChatStatus,
  getPlatformStatistics,
} from '../services/admin.js';
import { db } from '../db/database.js';
import { sanitizePublicProfile } from '../services/auth.js';
import { wsManager } from '../websocket.js';

export const adminRouter = Router();

// Middleware: Must be at least admin or owner
function requireAdminOrOwner(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'دسترسی مجاز نمی‌باشد. این بخش مختص مدیریت است' });
  }
  next();
}

// Middleware: Must be owner only
function requireOwner(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || user.role !== 'owner') {
    return res.status(403).json({ error: 'این عملیات منحصراً در حیطه اختیارات مالک کل سیستم (MAXO) است' });
  }
  next();
}

adminRouter.use(authenticateMiddleware);
adminRouter.use(requireAdminOrOwner);

// Get platform statistics
adminRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const stats = await getPlatformStatistics(actor);
    return res.json(stats);
  } catch (err: any) {
    return res.status(403).json({ error: err.message || 'خطا در دریافت آمار' });
  }
});

// Get user list with search
adminRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const allUsers = await db.getAllUsers();
    const filtered = allUsers
      .filter(u => {
        if (!search) return true;
        return (
          u.username.toLowerCase().includes(search) ||
          u.displayName.toLowerCase().includes(search)
        );
      })
      .map(sanitizePublicProfile);

    return res.json({ users: filtered });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در واکشی کاربران' });
  }
});

// Promote user to admin (Owner only)
adminRouter.post('/promote', requireOwner, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { userId, permissions } = req.body;
    const updated = await promoteToAdmin({ actor, targetUserId: userId, permissions });
    return res.json({ user: sanitizePublicProfile(updated), message: 'کاربر با موفقیت به مقام مدیر ارتقا یافت' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در ارتقای کاربر' });
  }
});

// Demote admin to user (Owner only)
adminRouter.post('/demote', requireOwner, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { userId } = req.body;
    const updated = await demoteAdmin({ actor, targetUserId: userId });
    return res.json({ user: sanitizePublicProfile(updated), message: 'دسترسی مدیریت کاربر لغو شد' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در لغو دسترسی مدیر' });
  }
});

// Update admin permissions (Owner only)
adminRouter.put('/permissions', requireOwner, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { userId, permissions } = req.body;
    const updated = await updateAdminPermissions({ actor, targetUserId: userId, permissions });
    return res.json({ user: sanitizePublicProfile(updated), message: 'اختیارات مدیر با موفقیت بروزرسانی شد' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در تغییر اختیارات مدیر' });
  }
});

// Suspend or unsuspend user
adminRouter.post('/suspend', async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { userId, reason } = req.body;
    const updated = await toggleSuspendUser({ actor, targetUserId: userId, reason });

    if (updated.isSuspended) {
      wsManager.broadcast({
        type: 'USER_SUSPENDED',
        data: { userId: updated.id, username: updated.username },
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      user: sanitizePublicProfile(updated),
      message: updated.isSuspended ? 'کاربر مسدود شد' : 'مسدودیت کاربر لغو شد',
    });
  } catch (err: any) {
    return res.status(403).json({ error: err.message || 'خطا در تغییر وضعیت حساب کاربر' });
  }
});

// Lock or unlock global chat
adminRouter.post('/chat-status', async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { isClosed, reason } = req.body;
    const settings = await toggleGlobalChatStatus({ actor, isClosed, reason });

    wsManager.broadcast({
      type: 'CHAT_STATUS_CHANGE',
      data: {
        isChatClosed: settings.isChatClosed,
        closedReason: settings.closedReason,
      },
      timestamp: settings.updatedAt,
    });

    return res.json({ settings, message: settings.isChatClosed ? 'گفتگوی همگانی بسته شد' : 'گفتگوی همگانی بازگشایی شد' });
  } catch (err: any) {
    return res.status(403).json({ error: err.message || 'خطا در تغییر وضعیت گفتگو' });
  }
});

// View audit logs
adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    if (actor.role !== 'owner' && (!actor.permissions || !actor.permissions.canViewAuditLogs)) {
      return res.status(403).json({ error: 'شما دسترسی لازم برای مشاهده لاگ‌های امنیتی را ندارید' });
    }

    const logs = await db.getAuditLogs(100);
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطا در بارگذاری لاگ‌های نظارتی' });
  }
});
