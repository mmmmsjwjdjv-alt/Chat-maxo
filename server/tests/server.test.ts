import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/database.js';
import {
  bootstrapOwnerAccount,
  registerUser,
  loginUser,
  changePassword,
} from '../src/services/auth.js';
import {
  createMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  togglePinMessage,
} from '../src/services/chat.js';
import {
  promoteToAdmin,
  updateAdminPermissions,
  toggleSuspendUser,
  toggleGlobalChatStatus,
  demoteAdmin,
} from '../src/services/admin.js';

test('MAXO CHAT Comprehensive Backend Test Suite', async (t) => {
  // Initialize Database
  await db.init();
  const currentSettings = await db.getSettings();
  await db.updateSettings({ ...currentSettings, isChatClosed: false });

  await t.test('1. Bootstrap initial owner account MAXO', async () => {
    await bootstrapOwnerAccount();
    const owner = await db.findUserByUsername('MAXO');
    assert.ok(owner, 'Owner MAXO must exist after bootstrap');
    assert.equal(owner.role, 'owner', 'Role must be owner');
    assert.equal(owner.isSuspended, false);

    // Test owner login
    const loginRes = await loginUser({ username: 'MAXO', password: 'MAXO1212' });
    assert.ok(loginRes.token, 'Owner should receive valid JWT token');
    assert.equal(loginRes.user.role, 'owner');
  });

  await t.test('2. User Registration and Duplicate Username Rejection', async () => {
    const username = 'testuser_' + Date.now();
    const regRes = await registerUser({
      username,
      password: 'password123',
      confirmPassword: 'password123',
      displayName: 'کاربر آزمایشی',
    });

    assert.ok(regRes.token);
    assert.equal(regRes.user.username, username);
    assert.equal(regRes.user.role, 'user', 'Public registration must never escalate to admin/owner');

    // Reject duplicate username (exact match)
    await assert.rejects(
      async () => {
        await registerUser({
          username,
          password: 'anotherPassword',
        });
      },
      /این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است/
    );

    // Reject duplicate username (case-insensitive)
    await assert.rejects(
      async () => {
        await registerUser({
          username: username.toUpperCase(),
          password: 'anotherPassword',
        });
      },
      /این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است/
    );

    // Reject reserved usernames like MAXO or admin
    await assert.rejects(
      async () => {
        await registerUser({
          username: 'maxo',
          password: 'password123',
        });
      },
      /این نام کاربری اختصاصی است/
    );
  });

  await t.test('3. User Login & Password Change', async () => {
    const username = 'pwd_user_' + Date.now();
    const reg = await registerUser({
      username,
      password: 'initialPassword1',
    });

    // Login with correct credentials
    const login = await loginUser({
      username,
      password: 'initialPassword1',
    });
    assert.ok(login.token);

    // Login with wrong password must fail safely
    await assert.rejects(
      async () => {
        await loginUser({
          username,
          password: 'wrongPassword!',
        });
      },
      /نام کاربری یا رمز عبور نامعتبر است/
    );

    // Change password
    await changePassword({
      userId: reg.user.id,
      currentPassword: 'initialPassword1',
      newPassword: 'newSuperPassword2',
    });

    // Old password should now fail
    await assert.rejects(
      async () => {
        await loginUser({
          username,
          password: 'initialPassword1',
        });
      },
      /نام کاربری یا رمز عبور نامعتبر است/
    );

    // New password should succeed
    const newLogin = await loginUser({
      username,
      password: 'newSuperPassword2',
    });
    assert.ok(newLogin.token);
  });

  await t.test('4. Global Chat: Message Delivery, Replies, Reactions, and Pins', async () => {
    const owner = (await db.findUserByUsername('MAXO'))!;
    const userA = (await db.findUserByUsername('pwd_user_' + Date.now())) || (await db.getAllUsers())[1];

    // Create message
    const msg1 = await createMessage({
      user: userA,
      content: 'سلام به همه اعضای MAXO CHAT!',
    });
    assert.ok(msg1.id);
    assert.equal(msg1.content, 'سلام به همه اعضای MAXO CHAT!');
    assert.equal(msg1.isDeleted, false);

    // Create reply to msg1
    const msg2 = await createMessage({
      user: owner,
      content: 'درود، خوش آمدید به گفتگوی همگانی.',
      replyToId: msg1.id,
    });
    assert.ok(msg2.replyTo);
    assert.equal(msg2.replyTo.id, msg1.id);

    // Reaction toggle
    const reactedMsg = await toggleMessageReaction({
      messageId: msg2.id,
      user: userA,
      emoji: '❤️',
    });
    assert.ok(reactedMsg.reactions['❤️'].includes(userA.username));

    // Reaction toggle off
    const unreactedMsg = await toggleMessageReaction({
      messageId: msg2.id,
      user: userA,
      emoji: '❤️',
    });
    assert.equal(unreactedMsg.reactions['❤️'], undefined);

    // Pin message (Owner authorized)
    const pinnedMsg = await togglePinMessage({
      messageId: msg2.id,
      user: owner,
    });
    assert.equal(pinnedMsg.isPinned, true);

    // User unauthorized pin attempt must fail
    await assert.rejects(
      async () => {
        await togglePinMessage({
          messageId: msg2.id,
          user: userA,
        });
      },
      /شما دسترسی لازم/
    );

    // Edit own message
    const edited = await editMessage({
      messageId: msg1.id,
      user: userA,
      newContent: 'متن ویرایش شده پیام!',
    });
    assert.equal(edited.content, 'متن ویرایش شده پیام!');
    assert.equal(edited.isEdited, true);

    // Delete message
    const deleted = await deleteMessage({
      messageId: msg1.id,
      user: userA,
    });
    assert.equal(deleted.isDeleted, true);
  });

  await t.test('5. Owner & Administrator Permissions, Suspend, and Chat Lock', async () => {
    const owner = (await db.findUserByUsername('MAXO'))!;
    const testAdminCandidate = await registerUser({
      username: 'moderator_' + Date.now(),
      password: 'adminPassword123',
    });
    const candidateUser = (await db.findUserById(testAdminCandidate.user.id))!;

    // Non-owner cannot promote
    await assert.rejects(
      async () => {
        await promoteToAdmin({
          actor: candidateUser,
          targetUserId: candidateUser.id,
        });
      },
      /فقط مالک سیستم/
    );

    // Owner promotes to admin with specific permissions
    const promoted = await promoteToAdmin({
      actor: owner,
      targetUserId: candidateUser.id,
      permissions: {
        canDeleteMessages: true,
        canSuspendUsers: false,
        canManageUsers: false,
        canToggleChat: true,
        canPinMessages: true,
        canViewAuditLogs: true,
      },
    });
    assert.equal(promoted.role, 'admin');
    assert.equal(promoted.permissions.canDeleteMessages, true);
    assert.equal(promoted.permissions.canSuspendUsers, false);

    // Admin without suspend permission cannot suspend users
    const victim = await registerUser({
      username: 'victim_' + Date.now(),
      password: 'victimPassword123',
    });
    await assert.rejects(
      async () => {
        await toggleSuspendUser({
          actor: promoted,
          targetUserId: victim.user.id,
        });
      },
      /شما دسترسی لازم برای مسدودسازی/
    );

    // Owner can suspend users
    const suspendedVictim = await toggleSuspendUser({
      actor: owner,
      targetUserId: victim.user.id,
      reason: 'رفتار خلاف قوانین',
    });
    assert.equal(suspendedVictim.isSuspended, true);

    // Suspended user cannot login
    await assert.rejects(
      async () => {
        await loginUser({
          username: victim.user.username,
          password: 'victimPassword123',
        });
      },
      /مسدود شده است/
    );

    // Chat closure testing
    const closedSettings = await toggleGlobalChatStatus({
      actor: owner,
      isClosed: true,
      reason: 'تعمیرات و به‌روزرسانی سیستم',
    });
    assert.equal(closedSettings.isChatClosed, true);

    // Ordinary user cannot send messages while chat is closed
    const ordinaryUser = (await db.getAllUsers()).find(u => u.role === 'user' && !u.isSuspended)!;
    await assert.rejects(
      async () => {
        await createMessage({
          user: ordinaryUser,
          content: 'آیا چت باز است؟',
        });
      },
      /تعمیرات و به‌روزرسانی سیستم|گفتگوی همگانی/
    );

    // Reopen chat
    const reopenedSettings = await toggleGlobalChatStatus({
      actor: owner,
      isClosed: false,
    });
    assert.equal(reopenedSettings.isChatClosed, false);
  });
});
