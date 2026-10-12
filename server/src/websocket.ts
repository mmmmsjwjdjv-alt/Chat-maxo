import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'node:http';
import { verifyToken } from './services/auth.js';
import { db } from './db/database.js';
import { WebSocketMessagePayload } from './types.js';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  username?: string;
  role?: string;
  isAlive?: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, AuthenticatedSocket>();

  public init(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: AuthenticatedSocket, req) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Parse token from query parameter or first message
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');

      if (token) {
        this.authenticateSocket(ws, token);
      }

      ws.on('message', async (raw) => {
        try {
          const payload = JSON.parse(raw.toString());

          if (payload.type === 'AUTH') {
            this.authenticateSocket(ws, payload.token);
            return;
          }

          if (payload.type === 'TYPING') {
            if (ws.username) {
              this.broadcast({
                type: 'TYPING_INDICATOR',
                data: { username: ws.username, isTyping: Boolean(payload.isTyping) },
                timestamp: new Date().toISOString(),
              }, ws.userId);
            }
            return;
          }

          if (payload.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
            return;
          }
        } catch (e) {
          console.error('[WS] Message parse error:', e);
        }
      });

      ws.on('close', () => {
        if (ws.userId) {
          this.clients.delete(ws.userId);
          this.broadcastPresence();
        }
      });

      ws.on('error', (err) => {
        console.warn('[WS] Socket error:', err.message);
      });
    });

    // Heartbeat check every 30 seconds
    const interval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((client) => {
        const authSocket = client as AuthenticatedSocket;
        if (authSocket.isAlive === false) {
          if (authSocket.userId) this.clients.delete(authSocket.userId);
          return authSocket.terminate();
        }
        authSocket.isAlive = false;
        authSocket.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('[WS] WebSocket Server initialized at /ws');
  }

  private authenticateSocket(ws: AuthenticatedSocket, token: string): void {
    const payload = verifyToken(token);
    if (!payload) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'توکن نامعتبر است' },
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    ws.userId = payload.userId;
    ws.username = payload.username;
    ws.role = payload.role;
    this.clients.set(payload.userId, ws);

    ws.send(JSON.stringify({
      type: 'AUTH_SUCCESS',
      data: { userId: payload.userId, username: payload.username },
      timestamp: new Date().toISOString(),
    }));

    this.broadcastPresence();
  }

  public broadcast(payload: WebSocketMessagePayload, excludeUserId?: string): void {
    const message = JSON.stringify(payload);
    for (const [userId, client] of this.clients.entries()) {
      if (excludeUserId && userId === excludeUserId) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public broadcastPresence(): void {
    const onlineUsers = Array.from(this.clients.values()).map(c => ({
      userId: c.userId,
      username: c.username,
      role: c.role,
    }));

    this.broadcast({
      type: 'USER_PRESENCE',
      data: {
        onlineCount: this.clients.size,
        onlineUsers,
      },
      timestamp: new Date().toISOString(),
    });
  }

  public getOnlineCount(): number {
    return this.clients.size;
  }
}

export const wsManager = new WebSocketManager();
