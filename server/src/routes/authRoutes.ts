import { Router, Request, Response } from 'express';
import { registerUser, loginUser, changePassword, verifyToken, sanitizePublicProfile } from '../services/auth.js';
import { db } from '../db/database.js';

export const authRouter = Router();

// Middleware to extract user from authorization header
export async function authenticateMiddleware(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'لطفاً ابتدا وارد حساب کاربری خود شوید' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'نشست کاربری شما منقضی شده است' });
  }

  const user = await db.findUserById(payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'کاربر مورد نظر یافت نشد' });
  }

  if (user.isSuspended) {
    return res.status(403).json({ error: 'حساب کاربری شما مسدود شده است' });
  }

  (req as any).user = user;
  next();
}

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, confirmPassword, displayName } = req.body;
    const result = await registerUser({ username, password, confirmPassword, displayName });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در ثبت‌نام کاربر' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const result = await loginUser({ username, password });
    return res.json(result);
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'خطا در ورود به حساب' });
  }
});

authRouter.get('/me', authenticateMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ user: sanitizePublicProfile(user) });
});

authRouter.post('/change-password', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    await changePassword({ userId: user.id, currentPassword, newPassword });
    return res.json({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در تغییر رمز عبور' });
  }
});

authRouter.put('/profile', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { displayName, avatarUrl, bio } = req.body;

    if (displayName && typeof displayName === 'string') {
      user.displayName = displayName.trim().substring(0, 50);
    }
    if (avatarUrl !== undefined && typeof avatarUrl === 'string') {
      // Basic check for safe image url
      user.avatarUrl = avatarUrl.trim();
    }
    if (bio !== undefined && typeof bio === 'string') {
      user.bio = bio.trim().substring(0, 200);
    }
    user.updatedAt = new Date().toISOString();

    await db.saveUser(user);
    return res.json({ user: sanitizePublicProfile(user), message: 'پروفایل با موفقیت بروزرسانی شد' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'خطا در بروزرسانی پروفایل' });
  }
});
