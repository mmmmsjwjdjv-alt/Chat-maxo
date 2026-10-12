package com.example.model;

import org.json.JSONException;
import org.json.JSONObject;

public class User {
    private String id;
    private String username;
    private String displayName;
    private String passwordHash;
    private String role; // "owner", "admin", "user"
    private boolean isSuspended;
    private String bio;
    private String avatarUrl;
    private long createdAt;

    public User(String id, String username, String displayName, String passwordHash, String role) {
        this.id = id;
        this.username = username;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.role = role;
        this.isSuspended = false;
        this.bio = "";
        this.avatarUrl = "";
        this.createdAt = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public String getDisplayName() { return displayName != null && !displayName.isEmpty() ? displayName : username; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public boolean isSuspended() { return isSuspended; }
    public void setSuspended(boolean suspended) { isSuspended = suspended; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public long getCreatedAt() { return createdAt; }

    public boolean isOwner() {
        return "owner".equalsIgnoreCase(role);
    }

    public boolean isAdmin() {
        return "admin".equalsIgnoreCase(role) || isOwner();
    }

    public JSONObject toJson() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("id", id);
        obj.put("username", username);
        obj.put("displayName", displayName);
        obj.put("passwordHash", passwordHash);
        obj.put("role", role);
        obj.put("isSuspended", isSuspended);
        obj.put("bio", bio);
        obj.put("avatarUrl", avatarUrl);
        obj.put("createdAt", createdAt);
        return obj;
    }

    public static User fromJson(JSONObject obj) {
        try {
            String id = obj.optString("id", "usr_" + System.currentTimeMillis());
            String username = obj.getString("username");
            String displayName = obj.optString("displayName", username);
            String passwordHash = obj.optString("passwordHash", "");
            String role = obj.optString("role", "user");
            User user = new User(id, username, displayName, passwordHash, role);
            user.setSuspended(obj.optBoolean("isSuspended", false));
            user.setBio(obj.optString("bio", ""));
            user.setAvatarUrl(obj.optString("avatarUrl", ""));
            user.createdAt = obj.optLong("createdAt", System.currentTimeMillis());
            return user;
        } catch (JSONException e) {
            return null;
        }
    }
}
