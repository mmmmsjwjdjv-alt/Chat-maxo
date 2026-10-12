import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { User, UserRole, UserPublicProfile, AdminPermissions } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'MAXO_SECURE_JWT_SECRET_2026_PROD_KEY';
const JWT_EXPIRES_IN = '7d';

const RESERVED_USERNAMES = new Set(['maxo', 'admin', 'administrator', 'system', 'root', 'owner']);

export function sanitizePublicProfile(user: User): UserPublicProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    isSuspended: user.isSuspended,
    permissions: user.permissions,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token: string): { userId: string; username: string; role: UserRole } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: UserRole };
  } catch {
    return null;
  }
}

export async function bootstrapOwnerAccount(): Promise<void> {
  const bootstrapUsername = 'MAXO';
  const bootstrapPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || 'MAXO1212';

  const existing = await db.findUserByUsername(bootstrapUsername);
  if (!existing) {
    console.log('[BOOTSTRAP] Initializing secure owner account MAXO...');
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(bootstrapPassword, salt);
    const ownerId = 'user_maxo_owner';
    const now = new Date().toISOString();

    const fullPermissions: AdminPermissions = {
      canDeleteMessages: true,
      canSuspendUsers: true,
      canManageUsers: true,
      canToggleChat: true,
      canPinMessages: true,
      canViewAuditLogs: true,
    };

    const ownerUser: User = {
      id: ownerId,
      username: bootstrapUsername,
      displayName: 'مدیر کل MAXO',
      passwordHash,
      role: 'owner',
      isSuspended: false,
      avatarUrl: '',
      bio: 'مالک و مدیر ارشد پلتفرم MAXO CHAT',
      permissions: fullPermissions,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    await db.saveUser(ownerUser);
    await db.addAuditLog({
      id: 'log_' + Date.now(),
      action: 'BOOTSTRAP_OWNER_CREATED',
      actorId: ownerId,
      actorUsername: bootstrapUsername,
      details: 'حساب کاربری مالک ارشد اولیه MAXO با موفقیت ایجاد شد',
      timestamp: now,
    });
    console.log('[BOOTSTRAP] Owner MAXO initialized.');
  } else {
    // Idempotent: Keep owner's current password and role intact
    console.log('[BOOTSTRAP] Owner MAXO already exists. Preserving credentials.');
  }
}

export async function registerUser(params: {
  username: string;
  password: string;
  confirmPassword?: string;
  displayName?: string;
}): Promise<{ user: UserPublicProfile; token: string }> {
  const rawUsername = params.username?.trim();
  const rawPassword = params.password;

  if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 30) {
    throw new Error('نام کاربری باید بین ۳ تا ۳۰ کاراکتر باشد');
  }

  // Alphanumeric + underscores only
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(rawUsername)) {
    throw new Error('نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد و زیرخط (_) باشد');
  }

  const normalized = rawUsername.toLowerCase();
  if (RESERVED_USERNAMES.has(normalized)) {
    throw new Error('این نام کاربری اختصاصی است و امکان ثبت آن وجود ندارد');
  }

  if (!rawPassword || rawPassword.length < 6) {
    throw new Error('رمز عبور باید حداقل ۶ کاراکتر باشد');
  }

  if (params.confirmPassword && params.confirmPassword !== rawPassword) {
    throw new Error('رمز عبور و تکرار آن یکسان نیستند');
  }

  // Check unique username
  const existing = await db.findUserByUsername(rawUsername);
  if (existing) {
    throw new Error('این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است');
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(rawPassword, salt);
  const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  const newUser: User = {
    id: userId,
    username: rawUsername,
    displayName: params.displayName?.trim() || rawUsername,
    passwordHash,
    role: 'user', // Never allow public role escalation
    isSuspended: false,
    avatarUrl: '',
    bio: '',
    permissions: {
      canDeleteMessages: false,
      canSuspendUsers: false,
      canManageUsers: false,
      canToggleChat: false,
      canPinMessages: false,
      canViewAuditLogs: false,
    },
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  await db.saveUser(newUser);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: 'USER_REGISTERED',
    actorId: userId,
    actorUsername: rawUsername,
    details: `کاربر جدید با نام کاربری ${rawUsername} ثبت‌نام کرد`,
    timestamp: now,
  });

  const token = generateToken(newUser);
  return { user: sanitizePublicProfile(newUser), token };
}

export async function loginUser(params: {
  username: string;
  password: string;
}): Promise<{ user: UserPublicProfile; token: string }> {
  const username = params.username?.trim();
  const password = params.password;

  if (!username || !password) {
    throw new Error('لطفاً نام کاربری و رمز عبور را وارد کنید');
  }

  const user = await db.findUserByUsername(username);
  if (!user) {
    // Avoid revealing whether username or password was wrong
    throw new Error('نام کاربری یا رمز عبور نامعتبر است');
  }

  if (user.isSuspended) {
    throw new Error('حساب کاربری شما توسط مدیریت مسدود شده است');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error('نام کاربری یا رمز عبور نامعتبر است');
  }

  user.lastSeenAt = new Date().toISOString();
  await db.saveUser(user);

  const token = generateToken(user);
  return { user: sanitizePublicProfile(user), token };
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await db.findUserById(params.userId);
  if (!user) {
    throw new Error('کاربر یافت نشد');
  }

  const isMatch = await bcrypt.compare(params.currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new Error('رمز عبور فعلی اشتباه است');
  }

  if (!params.newPassword || params.newPassword.length < 6) {
    throw new Error('رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
  }

  const salt = await bcrypt.genSalt(12);
  user.passwordHash = await bcrypt.hash(params.newPassword, salt);
  user.updatedAt = new Date().toISOString();
  await db.saveUser(user);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: 'PASSWORD_CHANGED',
    actorId: user.id,
    actorUsername: user.username,
    details: 'رمز عبور کاربر تغییر یافت',
    timestamp: user.updatedAt,
  });
}
