import { db } from '../db/database.js';
import { ChatMessage, User } from '../types.js';

const DEFAULT_LEGACY_URL = 'https://tk-server.ir/json/CHAT-MAXO.json';

export interface LegacySyncReport {
  success: boolean;
  endpoint: string;
  isWritable: boolean;
  importedItemsCount: number;
  message: string;
  details?: any;
}

export async function inspectAndSyncLegacyJson(actor: User): Promise<LegacySyncReport> {
  if (actor.role !== 'owner') {
    throw new Error('فقط مالک سیستم دسترسی به ابزار همگام‌سازی منبع قدیمی را دارد');
  }

  const endpoint = process.env.LEGACY_JSON_URL || DEFAULT_LEGACY_URL;
  // Edit password kept purely server-side via environment variable:
  const editPassword = process.env.LEGACY_JSON_EDIT_PASSWORD || 'MAXO';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MAXO-CHAT-Server/1.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        endpoint,
        isWritable: false,
        importedItemsCount: 0,
        message: `خطا در برقراری ارتباط با نشانی قدیمی: وضعیت HTTP ${response.status}`,
      };
    }

    const rawData = await response.json();
    let importedCount = 0;

    // Check if the legacy data has array of messages or configuration items
    if (Array.isArray(rawData)) {
      for (const item of rawData) {
        if (item && typeof item === 'object' && (item.content || item.message || item.text)) {
          const content = String(item.content || item.message || item.text).trim();
          if (content) {
            const senderName = item.author || item.sender || item.username || 'کاربر مهمان قدیمی';
            const now = item.timestamp || item.createdAt || new Date().toISOString();
            const msgId = 'legacy_' + (item.id || Date.now() + '_' + Math.random().toString(36).substring(2, 6));

            const existing = await db.getMessageById(msgId);
            if (!existing) {
              const chatMsg: ChatMessage = {
                id: msgId,
                senderId: 'legacy_user',
                senderUsername: senderName,
                senderDisplayName: senderName,
                senderAvatarUrl: '',
                senderRole: 'user',
                content,
                replyTo: null,
                reactions: {},
                isPinned: false,
                isDeleted: false,
                isEdited: false,
                createdAt: now,
                updatedAt: now,
              };
              await db.saveMessage(chatMsg);
              importedCount++;
            }
          }
        }
      }
    }

    await db.addAuditLog({
      id: 'log_' + Date.now(),
      action: 'LEGACY_SYNC_EXECUTED',
      actorId: actor.id,
      actorUsername: actor.username,
      details: `همگام‌سازی از منبع قدیمی با موفقیت انجام شد. تعداد رکوردهای درون‌ریزی شده: ${importedCount}`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      endpoint,
      isWritable: false, // LiteSpeed static file without direct write API - safe read-only adapter
      importedItemsCount: importedCount,
      message: importedCount > 0 
        ? `همگام‌سازی با موفقیت انجام شد و تعداد ${importedCount} پیام وارد پایگاه داده گردید.`
        : 'ارتباط با نشانی قدیمی تأیید شد. منبع خالی یا قبلاً همگام‌سازی شده است.',
      details: {
        rawType: Array.isArray(rawData) ? `Array (${rawData.length} items)` : typeof rawData,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      endpoint,
      isWritable: false,
      importedItemsCount: 0,
      message: `امکان دسترسی به نشانی قدیمی میسر نشد: ${error.message || 'خطای شبکه'}`,
    };
  }
}
