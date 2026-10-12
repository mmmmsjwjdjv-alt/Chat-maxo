package com.example.model;

import org.json.JSONException;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class Message {
    private String id;
    private String senderId;
    private String senderUsername;
    private String senderDisplayName;
    private String senderRole;
    private String content;
    private long timestamp;
    private boolean isPinned;
    private String replySnippet;
    private int reactionsCount;
    private boolean isRemote;

    public Message(String id, String senderId, String senderUsername, String senderDisplayName,
                   String senderRole, String content, long timestamp, boolean isRemote) {
        this.id = id;
        this.senderId = senderId;
        this.senderUsername = senderUsername;
        this.senderDisplayName = senderDisplayName != null && !senderDisplayName.isEmpty() ? senderDisplayName : senderUsername;
        this.senderRole = senderRole != null ? senderRole : "user";
        this.content = content;
        this.timestamp = timestamp > 0 ? timestamp : System.currentTimeMillis();
        this.isPinned = false;
        this.replySnippet = null;
        this.reactionsCount = 0;
        this.isRemote = isRemote;
    }

    public String getId() { return id; }
    public String getSenderId() { return senderId; }
    public String getSenderUsername() { return senderUsername; }
    public String getSenderDisplayName() { return senderDisplayName; }
    public String getSenderRole() { return senderRole; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public long getTimestamp() { return timestamp; }
    public boolean isPinned() { return isPinned; }
    public void setPinned(boolean pinned) { isPinned = pinned; }
    public String getReplySnippet() { return replySnippet; }
    public void setReplySnippet(String replySnippet) { this.replySnippet = replySnippet; }
    public int getReactionsCount() { return reactionsCount; }
    public void setReactionsCount(int reactionsCount) { this.reactionsCount = reactionsCount; }
    public void incrementReactions() { this.reactionsCount++; }
    public boolean isRemote() { return isRemote; }

    public String getFormattedTime() {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
            return sdf.format(new Date(timestamp));
        } catch (Exception e) {
            return "";
        }
    }

    public JSONObject toJson() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("id", id);
        obj.put("senderId", senderId);
        obj.put("senderUsername", senderUsername);
        obj.put("senderDisplayName", senderDisplayName);
        obj.put("senderRole", senderRole);
        obj.put("content", content);
        obj.put("timestamp", timestamp);
        obj.put("isPinned", isPinned);
        obj.put("replySnippet", replySnippet != null ? replySnippet : "");
        obj.put("reactionsCount", reactionsCount);
        obj.put("isRemote", isRemote);
        return obj;
    }

    public static Message fromJson(JSONObject obj, boolean isRemote) {
        try {
            String id = obj.optString("id", "msg_" + System.currentTimeMillis());
            String senderId = obj.optString("senderId", "usr_unknown");
            String username = obj.optString("senderUsername", obj.optString("author", obj.optString("sender", "کاربر")));
            String displayName = obj.optString("senderDisplayName", username);
            String role = obj.optString("senderRole", "user");
            String content = obj.optString("content", obj.optString("message", obj.optString("text", "")));
            long time = obj.optLong("timestamp", System.currentTimeMillis());

            Message msg = new Message(id, senderId, username, displayName, role, content, time, isRemote);
            msg.setPinned(obj.optBoolean("isPinned", false));
            String reply = obj.optString("replySnippet", null);
            if (reply != null && !reply.isEmpty()) {
                msg.setReplySnippet(reply);
            }
            msg.setReactionsCount(obj.optInt("reactionsCount", 0));
            return msg;
        } catch (Exception e) {
            return null;
        }
    }
}
