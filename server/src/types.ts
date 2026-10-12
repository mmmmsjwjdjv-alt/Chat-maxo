export type UserRole = 'owner' | 'admin' | 'user';

export interface AdminPermissions {
  canDeleteMessages: boolean;
  canSuspendUsers: boolean;
  canManageUsers: boolean;
  canToggleChat: boolean;
  canPinMessages: boolean;
  canViewAuditLogs: boolean;
}

export interface User {
  id: string;
  username: string; // Normalized lowercase for uniqueness check
  displayName: string;
  passwordHash: string;
  role: UserRole;
  isSuspended: boolean;
  avatarUrl: string;
  bio: string;
  permissions: AdminPermissions;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  isSuspended: boolean;
  permissions: AdminPermissions;
  createdAt: string;
  lastSeenAt: string;
}

export interface MessageReaction {
  emoji: string;
  usernames: string[];
}

export interface MessageReplySnippet {
  id: string;
  senderName: string;
  contentSnippet: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatarUrl: string;
  senderRole: UserRole;
  content: string;
  replyTo?: MessageReplySnippet | null;
  reactions: Record<string, string[]>; // emoji -> array of usernames
  isPinned: boolean;
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorUsername: string;
  targetId?: string;
  targetUsername?: string;
  details: string;
  timestamp: string;
}

export interface SystemSettings {
  isChatClosed: boolean;
  welcomeMessage: string;
  closedReason?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WebSocketMessagePayload {
  type: 
    | 'AUTH_SUCCESS'
    | 'CHAT_MESSAGE_NEW'
    | 'CHAT_MESSAGE_EDIT'
    | 'CHAT_MESSAGE_DELETE'
    | 'CHAT_MESSAGE_PIN'
    | 'CHAT_MESSAGE_REACTION'
    | 'CHAT_STATUS_CHANGE'
    | 'USER_PRESENCE'
    | 'USER_SUSPENDED'
    | 'TYPING_INDICATOR'
    | 'SYSTEM_ANNOUNCEMENT'
    | 'ERROR';
  data?: any;
  timestamp: string;
}
