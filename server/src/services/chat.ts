import { db } from '../db/database.js';
import { ChatMessage, User, MessageReplySnippet } from '../types.js';

// Simple in-memory rate limiter per user: max 10 messages per 10 seconds
const userMessageRateMap = new Map<string, number[]>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 10_000;
  const maxMessages = 10;

  const timestamps = userMessageRateMap.get(userId) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  if (validTimestamps.length >= maxMessages) {
    return false;
  }
  validTimestamps.push(now);
  userMessageRateMap.set(userId, validTimestamps);
  return true;
}

export async function createMessage(params: {
  user: User;
  content: string;
  replyToId?: string;
}): Promise<ChatMessage> {
  const settings = await db.getSettings();
  if (settings.isChatClosed && params.user.role === 'user') {
    throw new Error(settings.closedReason || 'گفتگوی همگانی در حال حاضر توسط مدیریت موقتاً بسته شده است');
  }

  if (params.user.isSuspended) {
    throw new Error('حساب کاربری شما مسدود شده و امکان ارسال پیام ندارید');
  }

  if (!checkRateLimit(params.user.id)) {
    throw new Error('لطفاً کمی صبر کنید و از ارسال پیام‌های متوالی و سریع خودداری فرمایید');
  }

  const cleanContent = params.content?.trim();
  if (!cleanContent) {
    throw new Error('متن پیام نمی‌تواند خالی باشد');
  }

  if (cleanContent.length > 2000) {
    throw new Error('حداکثر طول هر پیام ۲۰۰۰ کاراکتر می‌باشد');
  }

  let replySnippet: MessageReplySnippet | null = null;
  if (params.replyToId) {
    const parentMsg = await db.getMessageById(params.replyToId);
    if (parentMsg && !parentMsg.isDeleted) {
      replySnippet = {
        id: parentMsg.id,
        senderName: parentMsg.senderDisplayName || parentMsg.senderUsername,
        contentSnippet: parentMsg.content.length > 80 ? parentMsg.content.substring(0, 80) + '...' : parentMsg.content,
      };
    }
  }

  const now = new Date().toISOString();
  const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const message: ChatMessage = {
    id: messageId,
    senderId: params.user.id,
    senderUsername: params.user.username,
    senderDisplayName: params.user.displayName || params.user.username,
    senderAvatarUrl: params.user.avatarUrl || '',
    senderRole: params.user.role,
    content: cleanContent,
    replyTo: replySnippet,
    reactions: {},
    isPinned: false,
    isDeleted: false,
    isEdited: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.saveMessage(message);
  return message;
}

export async function editMessage(params: {
  messageId: string;
  user: User;
  newContent: string;
}): Promise<ChatMessage> {
  const msg = await db.getMessageById(params.messageId);
  if (!msg) {
    throw new Error('پیام یافت نشد');
  }

  if (msg.isDeleted) {
    throw new Error('پیام حذف شده است و قابل ویرایش نیست');
  }

  if (msg.senderId !== params.user.id && params.user.role === 'user') {
    throw new Error('شما فقط می‌توانید پیام‌های خود را ویرایش کنید');
  }

  const cleanContent = params.newContent?.trim();
  if (!cleanContent) {
    throw new Error('متن پیام نمی‌تواند خالی باشد');
  }

  if (cleanContent.length > 2000) {
    throw new Error('حداکثر طول پیام ۲۰۰۰ کاراکتر است');
  }

  msg.content = cleanContent;
  msg.isEdited = true;
  msg.updatedAt = new Date().toISOString();

  await db.saveMessage(msg);
  return msg;
}

export async function deleteMessage(params: {
  messageId: string;
  user: User;
}): Promise<ChatMessage> {
  const msg = await db.getMessageById(params.messageId);
  if (!msg) {
    throw new Error('پیام مورد نظر یافت نشد');
  }

  const isOwner = params.user.role === 'owner';
  const isAdmin = params.user.role === 'admin' && params.user.permissions.canDeleteMessages;
  const isAuthor = msg.senderId === params.user.id;

  if (!isAuthor && !isOwner && !isAdmin) {
    throw new Error('شما دسترسی لازم برای حذف این پیام را ندارید');
  }

  msg.isDeleted = true;
  msg.content = 'این پیام حذف شده است.';
  msg.updatedAt = new Date().toISOString();

  await db.saveMessage(msg);

  if (!isAuthor) {
    await db.addAuditLog({
      id: 'log_' + Date.now(),
      action: 'MESSAGE_DELETED_BY_MOD',
      actorId: params.user.id,
      actorUsername: params.user.username,
      targetId: msg.senderId,
      targetUsername: msg.senderUsername,
      details: `پیام شناسه ${msg.id} توسط مدیر حذف شد`,
      timestamp: msg.updatedAt,
    });
  }

  return msg;
}

export async function toggleMessageReaction(params: {
  messageId: string;
  user: User;
  emoji: string;
}): Promise<ChatMessage> {
  const msg = await db.getMessageById(params.messageId);
  if (!msg || msg.isDeleted) {
    throw new Error('امکان ثبت واکنش بر روی این پیام وجود ندارد');
  }

  const emoji = params.emoji?.trim();
  if (!emoji || emoji.length > 8) {
    throw new Error('اموجی نامعتبر است');
  }

  if (!msg.reactions) {
    msg.reactions = {};
  }

  const currentUsers = msg.reactions[emoji] || [];
  const username = params.user.username;

  if (currentUsers.includes(username)) {
    // Remove reaction
    msg.reactions[emoji] = currentUsers.filter(u => u !== username);
    if (msg.reactions[emoji].length === 0) {
      delete msg.reactions[emoji];
    }
  } else {
    // Add reaction
    msg.reactions[emoji] = [...currentUsers, username];
  }

  msg.updatedAt = new Date().toISOString();
  await db.saveMessage(msg);
  return msg;
}

export async function togglePinMessage(params: {
  messageId: string;
  user: User;
}): Promise<ChatMessage> {
  const isOwner = params.user.role === 'owner';
  const isAdmin = params.user.role === 'admin' && params.user.permissions.canPinMessages;

  if (!isOwner && !isAdmin) {
    throw new Error('شما دسترسی لازم برای پین یا آن‌پین کردن پیام را ندارید');
  }

  const msg = await db.getMessageById(params.messageId);
  if (!msg || msg.isDeleted) {
    throw new Error('پیام جهت پین کردن یافت نشد');
  }

  msg.isPinned = !msg.isPinned;
  msg.updatedAt = new Date().toISOString();
  await db.saveMessage(msg);

  await db.addAuditLog({
    id: 'log_' + Date.now(),
    action: msg.isPinned ? 'MESSAGE_PINNED' : 'MESSAGE_UNPINNED',
    actorId: params.user.id,
    actorUsername: params.user.username,
    targetId: msg.senderId,
    targetUsername: msg.senderUsername,
    details: `وضعیت پین پیام ${msg.id} به ${msg.isPinned} تغییر یافت`,
    timestamp: msg.updatedAt,
  });

  return msg;
}
