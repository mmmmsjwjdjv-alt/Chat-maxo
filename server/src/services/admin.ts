import { db } from '../db/database.js';
import { User, UserRole, AdminPermissions, AuditLogEntry, SystemSettings } from '../types.js';

export async function promoteToAdmin(params: {
  actor: User;
  targetUserId: string;
  permissions?: Partial<AdminPermissions>;
}): Promise<User> {
  if (params.actor.role !== 'owner') {
    throw new Error('فقط مالک سیستم امکان ارتقای کاربران به مقام مدیر را دارد');
  }

  const target = await db.findUserById(params.targetUserId);
  if (!target) {
    throw new Error('کاربر مورد نظر یافت نشد');
  }

  if (target.role === 'owner') {
    throw new Error('تغییر نقش مالک سیستم مجاز نیست');
  }

  target.role = 'admin';
  target.permissions = {
    canDeleteMessages: params.permissions?.canDeleteMessages ?? true,
    canSuspendUsers: params.permissions?.canSuspendUsers ?? false,
    canManageUsers: params.permissions?.canManageUsers ?? false,
    canToggleChat: params.permissions?.canToggleChat ?? false,
    canPinMessages: params.permissions?.canPinMessages ?? true,
    canViewAuditLogs: params.permissions?.canViewAuditLogs ?? true,
  };
  target.updatedAt = new Date().toISOString();

  await db.saveUser(target);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: 'USER_PROMOTED_TO_ADMIN',
    actorId: params.actor.id,
    actorUsername: params.actor.username,
    targetId: target.id,
    targetUsername: target.username,
    details: `کاربر ${target.username} توسط مالک به مدیر ارتقا یافت`,
    timestamp: target.updatedAt,
  });

  return target;
}

export async function demoteAdmin(params: {
  actor: User;
  targetUserId: string;
}): Promise<User> {
  if (params.actor.role !== 'owner') {
    throw new Error('تنها مالک پلتفرم می‌تواند نقش مدیریت را لغو کند');
  }

  const target = await db.findUserById(params.targetUserId);
  if (!target) {
    throw new Error('کاربر مورد نظر یافت نشد');
  }

  if (target.role === 'owner') {
    throw new Error('نمی‌توان نقش مالک پلتفرم را لغو کرد');
  }

  target.role = 'user';
  target.permissions = {
    canDeleteMessages: false,
    canSuspendUsers: false,
    canManageUsers: false,
    canToggleChat: false,
    canPinMessages: false,
    canViewAuditLogs: false,
  };
  target.updatedAt = new Date().toISOString();

  await db.saveUser(target);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: 'ADMIN_DEMOTED_TO_USER',
    actorId: params.actor.id,
    actorUsername: params.actor.username,
    targetId: target.id,
    targetUsername: target.username,
    details: `دسترسی مدیریت کاربر ${target.username} لغو شد`,
    timestamp: target.updatedAt,
  });

  return target;
}

export async function updateAdminPermissions(params: {
  actor: User;
  targetUserId: string;
  permissions: AdminPermissions;
}): Promise<User> {
  if (params.actor.role !== 'owner') {
    throw new Error('تنها مالک سیستم مجاز به تغییر اختیارات مدیران است');
  }

  const target = await db.findUserById(params.targetUserId);
  if (!target) {
    throw new Error('کاربر یافت نشد');
  }

  if (target.role === 'owner') {
    throw new Error('اختیارات مالک سیستم نامحدود بوده و قابل تغییر نیست');
  }

  target.permissions = { ...params.permissions };
  target.updatedAt = new Date().toISOString();

  await db.saveUser(target);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: 'PERMISSIONS_UPDATED',
    actorId: params.actor.id,
    actorUsername: params.actor.username,
    targetId: target.id,
    targetUsername: target.username,
    details: `اختیارات مدیر ${target.username} بروزرسانی شد: ${JSON.stringify(params.permissions)}`,
    timestamp: target.updatedAt,
  });

  return target;
}

export async function toggleSuspendUser(params: {
  actor: User;
  targetUserId: string;
  reason?: string;
}): Promise<User> {
  const isOwner = params.actor.role === 'owner';
  const isAdmin = params.actor.role === 'admin' && params.actor.permissions.canSuspendUsers;

  if (!isOwner && !isAdmin) {
    throw new Error('شما دسترسی لازم برای مسدودسازی یا فعال‌سازی کاربران را ندارید');
  }

  const target = await db.findUserById(params.targetUserId);
  if (!target) {
    throw new Error('کاربر یافت نشد');
  }

  if (target.role === 'owner') {
    throw new Error('مسدودسازی حساب کاربری مالک پلتفرم غیرممکن است');
  }

  if (params.actor.role === 'admin' && target.role === 'admin') {
    throw new Error('مدیران نمی‌توانند سایر همکاران مدیر را مسدود کنند');
  }

  target.isSuspended = !target.isSuspended;
  target.updatedAt = new Date().toISOString();

  await db.saveUser(target);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: target.isSuspended ? 'USER_SUSPENDED' : 'USER_RESTORED',
    actorId: params.actor.id,
    actorUsername: params.actor.username,
    targetId: target.id,
    targetUsername: target.username,
    details: `${target.isSuspended ? 'مسدودسازی' : 'رفع مسدودیت'} کاربر ${target.username}${params.reason ? ` به دلیل: ${params.reason}` : ''}`,
    timestamp: target.updatedAt,
  });

  return target;
}

export async function toggleGlobalChatStatus(params: {
  actor: User;
  isClosed: boolean;
  reason?: string;
}): Promise<SystemSettings> {
  const isOwner = params.actor.role === 'owner';
  const isAdmin = params.actor.role === 'admin' && params.actor.permissions.canToggleChat;

  if (!isOwner && !isAdmin) {
    throw new Error('شما دسترسی لازم جهت باز و بسته نمودن گفتگوی همگانی را ندارید');
  }

  const settings = await db.getSettings();
  settings.isChatClosed = params.isClosed;
  if (params.reason) {
    settings.closedReason = params.reason;
  }
  settings.updatedAt = new Date().toISOString();
  settings.updatedBy = params.actor.username;

  await db.updateSettings(settings);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: params.isClosed ? 'CHAT_CLOSED' : 'CHAT_REOPENED',
    actorId: params.actor.id,
    actorUsername: params.actor.username,
    details: `گفتگوی همگانی توسط ${params.actor.username} ${params.isClosed ? 'بسته شد' : 'بازگشایی شد'}${params.reason ? ` (${params.reason})` : ''}`,
    timestamp: settings.updatedAt,
  });

  return settings;
}

export async function getPlatformStatistics(actor: User): Promise<{
  totalUsers: number;
  totalAdmins: number;
  totalMessages: number;
  suspendedUsers: number;
  isChatClosed: boolean;
}> {
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new Error('دسترسی فقط برای کادر مدیریت امکان‌پذیر است');
  }

  const users = await db.getAllUsers();
  const messages = await db.getRecentMessages(1000);
  const settings = await db.getSettings();

  return {
    totalUsers: users.length,
    totalAdmins: users.filter(u => u.role === 'admin' || u.role === 'owner').length,
    totalMessages: messages.length,
    suspendedUsers: users.filter(u => u.isSuspended).length,
    isChatClosed: settings.isChatClosed,
  };
}
