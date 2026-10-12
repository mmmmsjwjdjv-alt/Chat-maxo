import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { User, ChatMessage, AuditLogEntry, SystemSettings } from '../types.js';

const { Pool } = pg;

export class DatabaseManager {
  private pool: pg.Pool | null = null;
  private isPg = false;
  private localDataFile: string;
  private inMemoryData: {
    users: Map<string, User>;
    messages: Map<string, ChatMessage>;
    auditLogs: AuditLogEntry[];
    settings: SystemSettings;
  };

  constructor() {
    this.localDataFile = path.resolve(process.cwd(), 'data', 'maxo_data.json');
    this.inMemoryData = {
      users: new Map(),
      messages: new Map(),
      auditLogs: [],
      settings: {
        isChatClosed: false,
        welcomeMessage: 'به پیام‌رسان پیشرفته MAXO خوش آمدید',
        updatedAt: new Date().toISOString(),
        updatedBy: 'SYSTEM',
      },
    };
  }

  public async init(): Promise<void> {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        console.log('[DB] Connecting to PostgreSQL database...');
        this.pool = new Pool({
          connectionString: dbUrl,
          ssl: process.env.NODE_ENV === 'production' && !dbUrl.includes('localhost')
            ? { rejectUnauthorized: false }
            : false,
        });

        // Test connection
        const client = await this.pool.connect();
        try {
          console.log('[DB] PostgreSQL connected successfully. Running schema...');
          const schemaPath = path.resolve(process.cwd(), 'src', 'db', 'schema.sql');
          if (fs.existsSync(schemaPath)) {
            const sql = fs.readFileSync(schemaPath, 'utf8');
            await client.query(sql);
            console.log('[DB] Schema verified/migrated.');
          }
          this.isPg = true;
          return;
        } finally {
          client.release();
        }
      } catch (err) {
        console.warn('[DB] PostgreSQL connection failed. Falling back to persistent local store:', err);
        this.isPg = false;
      }
    } else {
      console.log('[DB] No DATABASE_URL provided. Initializing persistent local data store.');
    }

    // Initialize local JSON storage fallback
    this.loadLocalData();
  }

  private loadLocalData(): void {
    try {
      const dataDir = path.dirname(this.localDataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.localDataFile)) {
        const raw = fs.readFileSync(this.localDataFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.users) {
          this.inMemoryData.users = new Map(Object.entries(parsed.users));
        }
        if (parsed.messages) {
          this.inMemoryData.messages = new Map(Object.entries(parsed.messages));
        }
        if (Array.isArray(parsed.auditLogs)) {
          this.inMemoryData.auditLogs = parsed.auditLogs;
        }
        if (parsed.settings) {
          this.inMemoryData.settings = parsed.settings;
        }
        console.log(`[DB] Loaded ${this.inMemoryData.users.size} users and ${this.inMemoryData.messages.size} messages from local file.`);
      }
    } catch (e) {
      console.error('[DB] Failed to load local data file:', e);
    }
  }

  public saveLocalData(): void {
    if (this.isPg) return;
    try {
      const dataDir = path.dirname(this.localDataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serializable = {
        users: Object.fromEntries(this.inMemoryData.users),
        messages: Object.fromEntries(this.inMemoryData.messages),
        auditLogs: this.inMemoryData.auditLogs,
        settings: this.inMemoryData.settings,
      };
      fs.writeFileSync(this.localDataFile, JSON.stringify(serializable, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Failed to persist local data:', e);
    }
  }

  // --- Users Operations ---
  public async findUserByUsername(username: string): Promise<User | null> {
    const normalized = username.trim().toLowerCase();
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        'SELECT id, username, display_name AS "displayName", password_hash AS "passwordHash", role, is_suspended AS "isSuspended", avatar_url AS "avatarUrl", bio, permissions, created_at AS "createdAt", updated_at AS "updatedAt", last_seen_at AS "lastSeenAt" FROM users WHERE LOWER(username) = $1 LIMIT 1',
        [normalized]
      );
      return res.rows[0] || null;
    }

    for (const u of this.inMemoryData.users.values()) {
      if (u.username.toLowerCase() === normalized) {
        return u;
      }
    }
    return null;
  }

  public async findUserById(id: string): Promise<User | null> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        'SELECT id, username, display_name AS "displayName", password_hash AS "passwordHash", role, is_suspended AS "isSuspended", avatar_url AS "avatarUrl", bio, permissions, created_at AS "createdAt", updated_at AS "updatedAt", last_seen_at AS "lastSeenAt" FROM users WHERE id = $1 LIMIT 1',
        [id]
      );
      return res.rows[0] || null;
    }
    return this.inMemoryData.users.get(id) || null;
  }

  public async saveUser(user: User): Promise<void> {
    if (this.isPg && this.pool) {
      await this.pool.query(
        `INSERT INTO users (id, username, display_name, password_hash, role, is_suspended, avatar_url, bio, permissions, created_at, updated_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_suspended = EXCLUDED.is_suspended,
           avatar_url = EXCLUDED.avatar_url,
           bio = EXCLUDED.bio,
           permissions = EXCLUDED.permissions,
           updated_at = EXCLUDED.updated_at,
           last_seen_at = EXCLUDED.last_seen_at`,
        [
          user.id,
          user.username,
          user.displayName,
          user.passwordHash,
          user.role,
          user.isSuspended,
          user.avatarUrl,
          user.bio,
          JSON.stringify(user.permissions),
          user.createdAt,
          user.updatedAt,
          user.lastSeenAt,
        ]
      );
    } else {
      this.inMemoryData.users.set(user.id, user);
      this.saveLocalData();
    }
  }

  public async getAllUsers(): Promise<User[]> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        'SELECT id, username, display_name AS "displayName", password_hash AS "passwordHash", role, is_suspended AS "isSuspended", avatar_url AS "avatarUrl", bio, permissions, created_at AS "createdAt", updated_at AS "updatedAt", last_seen_at AS "lastSeenAt" FROM users ORDER BY created_at ASC'
      );
      return res.rows;
    }
    return Array.from(this.inMemoryData.users.values());
  }

  // --- Messages Operations ---
  public async getRecentMessages(limit = 100): Promise<ChatMessage[]> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        `SELECT id, sender_id AS "senderId", sender_username AS "senderUsername", sender_display_name AS "senderDisplayName",
                sender_avatar_url AS "senderAvatarUrl", sender_role AS "senderRole", content, reply_to AS "replyTo",
                reactions, is_pinned AS "isPinned", is_deleted AS "isDeleted", is_edited AS "isEdited",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM messages
         ORDER BY created_at ASC
         LIMIT $1`,
        [limit]
      );
      return res.rows;
    }
    const msgs = Array.from(this.inMemoryData.messages.values());
    msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return msgs.slice(-limit);
  }

  public async getMessageById(id: string): Promise<ChatMessage | null> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        `SELECT id, sender_id AS "senderId", sender_username AS "senderUsername", sender_display_name AS "senderDisplayName",
                sender_avatar_url AS "senderAvatarUrl", sender_role AS "senderRole", content, reply_to AS "replyTo",
                reactions, is_pinned AS "isPinned", is_deleted AS "isDeleted", is_edited AS "isEdited",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM messages WHERE id = $1 LIMIT 1`,
        [id]
      );
      return res.rows[0] || null;
    }
    return this.inMemoryData.messages.get(id) || null;
  }

  public async saveMessage(msg: ChatMessage): Promise<void> {
    if (this.isPg && this.pool) {
      await this.pool.query(
        `INSERT INTO messages (id, sender_id, sender_username, sender_display_name, sender_avatar_url, sender_role, content, reply_to, reactions, is_pinned, is_deleted, is_edited, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           reply_to = EXCLUDED.reply_to,
           reactions = EXCLUDED.reactions,
           is_pinned = EXCLUDED.is_pinned,
           is_deleted = EXCLUDED.is_deleted,
           is_edited = EXCLUDED.is_edited,
           updated_at = EXCLUDED.updated_at`,
        [
          msg.id,
          msg.senderId,
          msg.senderUsername,
          msg.senderDisplayName,
          msg.senderAvatarUrl,
          msg.senderRole,
          msg.content,
          msg.replyTo ? JSON.stringify(msg.replyTo) : null,
          JSON.stringify(msg.reactions),
          msg.isPinned,
          msg.isDeleted,
          msg.isEdited,
          msg.createdAt,
          msg.updatedAt,
        ]
      );
    } else {
      this.inMemoryData.messages.set(msg.id, msg);
      this.saveLocalData();
    }
  }

  // --- Audit Logs ---
  public async addAuditLog(entry: AuditLogEntry): Promise<void> {
    if (this.isPg && this.pool) {
      await this.pool.query(
        `INSERT INTO audit_logs (id, action, actor_id, actor_username, target_id, target_username, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [entry.id, entry.action, entry.actorId, entry.actorUsername, entry.targetId || null, entry.targetUsername || null, entry.details, entry.timestamp]
      );
    } else {
      this.inMemoryData.auditLogs.unshift(entry);
      if (this.inMemoryData.auditLogs.length > 500) {
        this.inMemoryData.auditLogs.pop();
      }
      this.saveLocalData();
    }
  }

  public async getAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        `SELECT id, action, actor_id AS "actorId", actor_username AS "actorUsername", target_id AS "targetId", target_username AS "targetUsername", details, timestamp
         FROM audit_logs
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      );
      return res.rows;
    }
    return this.inMemoryData.auditLogs.slice(0, limit);
  }

  // --- Settings ---
  public async getSettings(): Promise<SystemSettings> {
    if (this.isPg && this.pool) {
      const res = await this.pool.query(
        `SELECT value FROM system_settings WHERE key = 'global' LIMIT 1`
      );
      if (res.rows[0]) {
        return res.rows[0].value;
      }
    }
    return this.inMemoryData.settings;
  }

  public async updateSettings(settings: SystemSettings): Promise<void> {
    if (this.isPg && this.pool) {
      await this.pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('global', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(settings)]
      );
    } else {
      this.inMemoryData.settings = settings;
      this.saveLocalData();
    }
  }
}

export const db = new DatabaseManager();
