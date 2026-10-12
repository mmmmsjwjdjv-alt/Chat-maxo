package com.example.auth;

import android.content.Context;
import android.content.SharedPreferences;
import com.example.model.User;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

public class AccountManager {
    private static final String PREF_NAME = "maxo_accounts_pref";
    private static final String KEY_USERS_JSON = "key_users_json";
    private static final String KEY_LOGGED_IN_USER_ID = "key_logged_in_user_id";
    private static final String SALT = "MAXO_CHAT_SECURE_SALT_2026_";

    public static final String BOOTSTRAP_OWNER_USERNAME = "MAXO";
    public static final String BOOTSTRAP_OWNER_INITIAL_PASSWORD = "MAXO1212";

    private static AccountManager instance;
    private final SharedPreferences prefs;
    private final List<User> usersList;
    private User currentUser;

    private AccountManager(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        this.usersList = new ArrayList<>();
        loadUsers();
        bootstrapOwnerIfNeeded();
        checkActiveSession();
    }

    public static synchronized AccountManager getInstance(Context context) {
        if (instance == null) {
            instance = new AccountManager(context);
        }
        return instance;
    }

    private void loadUsers() {
        usersList.clear();
        String json = prefs.getString(KEY_USERS_JSON, null);
        if (json != null) {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    User u = User.fromJson(arr.getJSONObject(i));
                    if (u != null) {
                        usersList.add(u);
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private void saveUsers() {
        try {
            JSONArray arr = new JSONArray();
            for (User u : usersList) {
                arr.put(u.toJson());
            }
            prefs.edit().putString(KEY_USERS_JSON, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    /**
     * Idempotently bootstraps the initial owner account MAXO
     */
    private void bootstrapOwnerIfNeeded() {
        User owner = findUserByUsername(BOOTSTRAP_OWNER_USERNAME);
        if (owner == null) {
            String initialHash = hashPassword(BOOTSTRAP_OWNER_INITIAL_PASSWORD);
            User newOwner = new User(
                "owner_maxo_01",
                BOOTSTRAP_OWNER_USERNAME,
                "مدیر ارشد MAXO",
                initialHash,
                "owner"
            );
            newOwner.setBio("مالک اصلی و مدیر کل پلتفرم MAXO CHAT");
            usersList.add(newOwner);
            saveUsers();
        }
    }

    private void checkActiveSession() {
        String activeId = prefs.getString(KEY_LOGGED_IN_USER_ID, null);
        if (activeId != null) {
            for (User u : usersList) {
                if (u.getId().equals(activeId)) {
                    this.currentUser = u;
                    return;
                }
            }
        }
        this.currentUser = null;
    }

    public User getCurrentUser() {
        return currentUser;
    }

    public boolean isLoggedIn() {
        return currentUser != null;
    }

    public static String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((SALT + password).getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            return String.valueOf((SALT + password).hashCode());
        }
    }

    public User findUserByUsername(String username) {
        if (username == null) return null;
        String normalized = username.trim().toLowerCase();
        for (User u : usersList) {
            if (u.getUsername().trim().toLowerCase().equals(normalized)) {
                return u;
            }
        }
        return null;
    }

    public void register(String username, String password, String displayName) throws Exception {
        if (username == null || username.trim().length() < 3) {
            throw new Exception("نام کاربری باید حداقل ۳ کاراکتر باشد");
        }

        String cleanUsername = username.trim();
        if (!cleanUsername.matches("^[a-zA-Z0-9_]+$")) {
            throw new Exception("نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد و زیرخط باشد");
        }

        if (BOOTSTRAP_OWNER_USERNAME.equalsIgnoreCase(cleanUsername)) {
            throw new Exception("این نام کاربری اختصاصی است و امکان ثبت‌نام آن وجود ندارد");
        }

        if (findUserByUsername(cleanUsername) != null) {
            throw new Exception("این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است");
        }

        if (password == null || password.length() < 6) {
            throw new Exception("رمز عبور باید حداقل ۶ کاراکتر باشد");
        }

        String hash = hashPassword(password);
        String id = "usr_" + System.currentTimeMillis();
        String display = (displayName != null && !displayName.trim().isEmpty()) ? displayName.trim() : cleanUsername;

        User newUser = new User(id, cleanUsername, display, hash, "user");
        usersList.add(newUser);
        saveUsers();

        this.currentUser = newUser;
        prefs.edit().putString(KEY_LOGGED_IN_USER_ID, id).apply();
    }

    public void login(String username, String password) throws Exception {
        if (username == null || password == null) {
            throw new Exception("لطفاً نام کاربری و رمز عبور را وارد نمایید");
        }

        User user = findUserByUsername(username);
        if (user == null) {
            throw new Exception("نام کاربری یا رمز عبور نامعتبر است");
        }

        if (user.isSuspended()) {
            throw new Exception("حساب کاربری شما مسدود شده است");
        }

        String inputHash = hashPassword(password);
        if (!inputHash.equals(user.getPasswordHash())) {
            throw new Exception("نام کاربری یا رمز عبور نامعتبر است");
        }

        this.currentUser = user;
        prefs.edit().putString(KEY_LOGGED_IN_USER_ID, user.getId()).apply();
    }

    public void changePassword(String currentPassword, String newPassword) throws Exception {
        if (currentUser == null) {
            throw new Exception("کاربر وارد نشده است");
        }

        String currentHash = hashPassword(currentPassword);
        if (!currentHash.equals(currentUser.getPasswordHash())) {
            throw new Exception("رمز عبور فعلی نادرست است");
        }

        if (newPassword == null || newPassword.length() < 6) {
            throw new Exception("رمز عبور جدید باید حداقل ۶ کاراکتر باشد");
        }

        currentUser.setPasswordHash(hashPassword(newPassword));
        saveUsers();
    }

    public void logout() {
        this.currentUser = null;
        prefs.edit().remove(KEY_LOGGED_IN_USER_ID).apply();
    }

    public List<User> getAllUsers() {
        return new ArrayList<>(usersList);
    }

    public void updateUser(User user) {
        for (int i = 0; i < usersList.size(); i++) {
            if (usersList.get(i).getId().equals(user.getId())) {
                usersList.set(i, user);
                saveUsers();
                if (currentUser != null && currentUser.getId().equals(user.getId())) {
                    currentUser = user;
                }
                break;
            }
        }
    }
}
