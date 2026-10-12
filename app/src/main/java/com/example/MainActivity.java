package com.example;

import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.example.auth.AccountManager;
import com.example.model.Message;
import com.example.model.User;
import com.example.network.MaxoJsonService;
import com.example.ui.MessageAdapter;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity implements MessageAdapter.OnMessageClickListener {
    private AccountManager accountManager;
    private User currentUser;
    private MaxoJsonService jsonService;

    private RecyclerView rvMessages;
    private MessageAdapter adapter;
    private SwipeRefreshLayout swipeRefresh;
    private LinearLayout layoutEmptyState;
    private EditText etMessageInput;
    private View btnSend;

    private ImageButton btnRefresh, btnAdmin, btnProfile, btnEndpointInfo;
    private LinearLayout bannerSourceStatus, layoutActiveReply;
    private TextView tvSourceStatus, tvActiveReplyText, tvAppSubtitle;
    private ImageButton btnCancelReply;

    private Button btnFormatBold, btnFormatItalic, btnFormatQuote, btnReactHeart, btnReactFire;

    private final List<Message> allMessages = new ArrayList<>();
    private Message activeReplyingMessage = null;
    private boolean isChatClosed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        accountManager = AccountManager.getInstance(this);
        if (!accountManager.isLoggedIn()) {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
            return;
        }

        currentUser = accountManager.getCurrentUser();
        jsonService = MaxoJsonService.getInstance();

        setContentView(R.layout.activity_main);

        initViews();
        setupRecyclerView();
        setupListeners();
        loadMessagesFromRemoteJson();
    }

    private void initViews() {
        rvMessages = findViewById(R.id.rv_messages);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        layoutEmptyState = findViewById(R.id.layout_empty_state);
        etMessageInput = findViewById(R.id.et_message_input);
        btnSend = findViewById(R.id.btn_send);

        btnRefresh = findViewById(R.id.btn_refresh);
        btnAdmin = findViewById(R.id.btn_admin);
        btnProfile = findViewById(R.id.btn_profile);
        btnEndpointInfo = findViewById(R.id.btn_endpoint_info);

        bannerSourceStatus = findViewById(R.id.banner_source_status);
        tvSourceStatus = findViewById(R.id.tv_source_status);
        layoutActiveReply = findViewById(R.id.layout_active_reply);
        tvActiveReplyText = findViewById(R.id.tv_active_reply_text);
        btnCancelReply = findViewById(R.id.btn_cancel_reply);
        tvAppSubtitle = findViewById(R.id.tv_app_subtitle);

        btnFormatBold = findViewById(R.id.btn_format_bold);
        btnFormatItalic = findViewById(R.id.btn_format_italic);
        btnFormatQuote = findViewById(R.id.btn_format_quote);
        btnReactHeart = findViewById(R.id.btn_react_heart);
        btnReactFire = findViewById(R.id.btn_react_fire);

        swipeRefresh.setColorSchemeColors(Color.WHITE);
        swipeRefresh.setProgressBackgroundColorSchemeColor(Color.parseColor("#171B23"));

        if (currentUser.isAdmin() || currentUser.isOwner()) {
            btnAdmin.setVisibility(View.VISIBLE);
        }

        tvAppSubtitle.setText("کاربر: " + currentUser.getDisplayName() + (currentUser.isOwner() ? " (مالک)" : ""));
    }

    private void setupRecyclerView() {
        LinearLayoutManager layoutManager = new LinearLayoutManager(this);
        layoutManager.setStackFromEnd(true);
        rvMessages.setLayoutManager(layoutManager);

        adapter = new MessageAdapter(currentUser.getId(), this);
        rvMessages.setAdapter(adapter);
    }

    private void setupListeners() {
        swipeRefresh.setOnRefreshListener(this::loadMessagesFromRemoteJson);
        btnRefresh.setOnClickListener(v -> loadMessagesFromRemoteJson());

        btnSend.setOnClickListener(v -> sendMessage());

        btnEndpointInfo.setOnClickListener(v -> showServerStatusDialog());
        bannerSourceStatus.setOnClickListener(v -> showServerStatusDialog());

        btnAdmin.setOnClickListener(v -> showOwnerDashboardDialog());
        btnProfile.setOnClickListener(v -> showProfileDialog());

        btnCancelReply.setOnClickListener(v -> clearActiveReply());

        // Markdown Formatting Helpers
        btnFormatBold.setOnClickListener(v -> insertFormatting("**", "**"));
        btnFormatItalic.setOnClickListener(v -> insertFormatting("*", "*"));
        btnFormatQuote.setOnClickListener(v -> insertFormatting("> ", ""));

        // Reaction Quick Inserts
        btnReactHeart.setOnClickListener(v -> appendText(" ❤️ "));
        btnReactFire.setOnClickListener(v -> appendText(" 🔥 "));
    }

    private void insertFormatting(String prefix, String suffix) {
        int start = etMessageInput.getSelectionStart();
        int end = etMessageInput.getSelectionEnd();
        String current = etMessageInput.getText().toString();

        if (start < 0 || end < 0) {
            etMessageInput.append(prefix + "متن" + suffix);
            return;
        }

        String selected = current.substring(Math.min(start, end), Math.max(start, end));
        String replacement = prefix + (selected.isEmpty() ? "متن" : selected) + suffix;
        etMessageInput.getText().replace(Math.min(start, end), Math.max(start, end), replacement);
        etMessageInput.setSelection(start + prefix.length(), start + prefix.length() + (selected.isEmpty() ? 3 : selected.length()));
    }

    private void appendText(String text) {
        etMessageInput.append(text);
    }

    private void loadMessagesFromRemoteJson() {
        swipeRefresh.setRefreshing(true);
        jsonService.fetchRemoteMessages(new MaxoJsonService.FetchCallback() {
            @Override
            public void onSuccess(List<Message> remoteMessages, String rawResponse) {
                swipeRefresh.setRefreshing(false);
                tvSourceStatus.setText("منبع آنلاین: CHAT-MAXO.json (متصل - فقط‌خواندنی)");

                // Preserve existing draft messages while merging remote messages
                List<Message> merged = new ArrayList<>(remoteMessages);
                for (Message local : allMessages) {
                    if (!local.isRemote()) {
                        merged.add(local);
                    }
                }

                allMessages.clear();
                allMessages.addAll(merged);
                adapter.setMessages(allMessages);

                if (allMessages.isEmpty()) {
                    layoutEmptyState.setVisibility(View.VISIBLE);
                } else {
                    layoutEmptyState.setVisibility(View.GONE);
                    rvMessages.scrollToPosition(allMessages.size() - 1);
                }
            }

            @Override
            public void onError(String errorMessage) {
                swipeRefresh.setRefreshing(false);
                tvSourceStatus.setText("خطای اتصال به CHAT-MAXO.json");
                Toast.makeText(MainActivity.this, errorMessage, Toast.LENGTH_SHORT).show();

                if (allMessages.isEmpty()) {
                    layoutEmptyState.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    private void sendMessage() {
        if (isChatClosed && !currentUser.isAdmin()) {
            Toast.makeText(this, "گفتگوی همگانی در حال حاضر توسط مدیریت بسته شده است", Toast.LENGTH_LONG).show();
            return;
        }

        String text = etMessageInput.getText().toString().trim();
        if (text.isEmpty()) return;

        long now = System.currentTimeMillis();
        String id = "msg_" + now;
        Message newMsg = new Message(
            id,
            currentUser.getId(),
            currentUser.getUsername(),
            currentUser.getDisplayName(),
            currentUser.getRole(),
            text,
            now,
            false // local draft
        );

        if (activeReplyingMessage != null) {
            newMsg.setReplySnippet(activeReplyingMessage.getSenderDisplayName() + ": " + activeReplyingMessage.getContent());
            clearActiveReply();
        }

        allMessages.add(newMsg);
        adapter.addMessage(newMsg);
        layoutEmptyState.setVisibility(View.GONE);
        rvMessages.scrollToPosition(allMessages.size() - 1);
        etMessageInput.setText("");

        // Attempt to send message with editing password MAXO to remote endpoint
        jsonService.postMessageWithPassword(newMsg, allMessages, new MaxoJsonService.PostCallback() {
            @Override
            public void onSuccess(String message) {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onNotice(String notice) {
                Toast.makeText(MainActivity.this, notice, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onMessageReply(Message message) {
        this.activeReplyingMessage = message;
        layoutActiveReply.setVisibility(View.VISIBLE);
        tvActiveReplyText.setText("پاسخ به " + message.getSenderDisplayName() + ": " + message.getContent());
        etMessageInput.requestFocus();
    }

    @Override
    public void onMessageReact(Message message) {
        message.incrementReactions();
        adapter.notifyDataSetChanged();
        Toast.makeText(this, "واکنش بر روی پیام ثبت شد", Toast.LENGTH_SHORT).show();
    }

    private void clearActiveReply() {
        this.activeReplyingMessage = null;
        layoutActiveReply.setVisibility(View.GONE);
    }

    private void showServerStatusDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_server_status);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        Button btnClose = dialog.findViewById(R.id.btn_dialog_close);
        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void showOwnerDashboardDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_owner_dashboard);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        TextView tvStats = dialog.findViewById(R.id.tv_owner_stats);
        Button btnToggle = dialog.findViewById(R.id.btn_toggle_chat);
        Button btnTest = dialog.findViewById(R.id.btn_test_write_capability);
        Button btnClose = dialog.findViewById(R.id.btn_close_dashboard);

        int totalUsers = accountManager.getAllUsers().size();
        tvStats.setText("تعداد حساب‌های محلی: " + totalUsers + " | وضعیت چت: " + (isChatClosed ? "مسدود" : "فعال"));

        btnToggle.setText(isChatClosed ? "🔓 بازگشایی گفتگوی همگانی" : "🔒 بستن موقت گفتگوی همگانی");
        btnToggle.setOnClickListener(v -> {
            isChatClosed = !isChatClosed;
            btnToggle.setText(isChatClosed ? "🔓 بازگشایی گفتگوی همگانی" : "🔒 بستن موقت گفتگوی همگانی");
            tvStats.setText("تعداد حساب‌های محلی: " + totalUsers + " | وضعیت چت: " + (isChatClosed ? "مسدود" : "فعال"));
            Toast.makeText(this, isChatClosed ? "گفتگوی همگانی بسته شد" : "گفتگوی همگانی بازگشایی شد", Toast.LENGTH_SHORT).show();
        });

        btnTest.setOnClickListener(v -> {
            btnTest.setEnabled(false);
            btnTest.setText("در حال استعلام...");
            jsonService.verifyWriteCapability((isWritable, technicalExplanation) -> {
                btnTest.setEnabled(true);
                btnTest.setText("🔄 استعلام قابلیت نوشتن در CHAT-MAXO.json");
                Toast.makeText(MainActivity.this, technicalExplanation, Toast.LENGTH_LONG).show();
            });
        });

        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void showProfileDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_profile);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        TextView tvInfo = dialog.findViewById(R.id.tv_profile_info);
        EditText etCurr = dialog.findViewById(R.id.et_curr_password);
        EditText etNew = dialog.findViewById(R.id.et_new_password);
        Button btnChange = dialog.findViewById(R.id.btn_change_password);
        Button btnLogout = dialog.findViewById(R.id.btn_logout);

        tvInfo.setText("نام کاربری: @" + currentUser.getUsername() + "\nنام نمایشی: " + currentUser.getDisplayName() + "\nنقش: " + (currentUser.isOwner() ? "مالک ارشد" : currentUser.isAdmin() ? "مدیر" : "کاربر عادی"));

        btnChange.setOnClickListener(v -> {
            String curr = etCurr.getText().toString();
            String newP = etNew.getText().toString();
            if (curr.isEmpty() || newP.isEmpty()) {
                Toast.makeText(this, "لطفاً هر دو فیلد رمز را وارد کنید", Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                accountManager.changePassword(curr, newP);
                Toast.makeText(this, "رمز عبور با موفقیت به‌روزرسانی شد", Toast.LENGTH_SHORT).show();
                dialog.dismiss();
            } catch (Exception e) {
                Toast.makeText(this, e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });

        btnLogout.setOnClickListener(v -> {
            accountManager.logout();
            dialog.dismiss();
            startActivity(new Intent(MainActivity.this, LoginActivity.class));
            finish();
        });

        dialog.show();
    }
}
