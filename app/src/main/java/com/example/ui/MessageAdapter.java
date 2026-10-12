package com.example.ui;

import android.graphics.Typeface;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.style.StyleSpan;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.example.R;
import com.example.model.Message;
import java.util.ArrayList;
import java.util.List;

public class MessageAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
    private static final int TYPE_OUTGOING = 1;
    private static final int TYPE_INCOMING = 2;

    private final List<Message> messages = new ArrayList<>();
    private final String currentUserId;
    private final OnMessageClickListener listener;

    public interface OnMessageClickListener {
        void onMessageReply(Message message);
        void onMessageReact(Message message);
    }

    public MessageAdapter(String currentUserId, OnMessageClickListener listener) {
        this.currentUserId = currentUserId;
        this.listener = listener;
    }

    public void setMessages(List<Message> newMessages) {
        this.messages.clear();
        if (newMessages != null) {
            this.messages.addAll(newMessages);
        }
        notifyDataSetChanged();
    }

    public void addMessage(Message message) {
        if (message != null) {
            this.messages.add(message);
            notifyItemInserted(this.messages.size() - 1);
        }
    }

    @Override
    public int getItemViewType(int position) {
        Message msg = messages.get(position);
        if (currentUserId != null && currentUserId.equals(msg.getSenderId())) {
            return TYPE_OUTGOING;
        }
        return TYPE_INCOMING;
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == TYPE_OUTGOING) {
            View v = inflater.inflate(R.layout.item_message_outgoing, parent, false);
            return new OutgoingViewHolder(v);
        } else {
            View v = inflater.inflate(R.layout.item_message_incoming, parent, false);
            return new IncomingViewHolder(v);
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        Message msg = messages.get(position);
        if (holder instanceof OutgoingViewHolder) {
            ((OutgoingViewHolder) holder).bind(msg, listener);
        } else if (holder instanceof IncomingViewHolder) {
            ((IncomingViewHolder) holder).bind(msg, listener);
        }
    }

    @Override
    public int getItemCount() {
        return messages.size();
    }

    private static CharSequence formatMessageContent(String raw) {
        if (raw == null) return "";
        if (raw.startsWith("**") && raw.endsWith("**") && raw.length() > 4) {
            SpannableString span = new SpannableString(raw.substring(2, raw.length() - 2));
            span.setSpan(new StyleSpan(Typeface.BOLD), 0, span.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            return span;
        }
        if (raw.startsWith("*") && raw.endsWith("*") && raw.length() > 2) {
            SpannableString span = new SpannableString(raw.substring(1, raw.length() - 1));
            span.setSpan(new StyleSpan(Typeface.ITALIC), 0, span.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            return span;
        }
        return raw;
    }

    static class IncomingViewHolder extends RecyclerView.ViewHolder {
        TextView tvAvatarMonogram, tvSenderName, tvSenderUsername, tvRoleBadge, tvRemoteBadge;
        TextView tvMessageContent, tvTime, tvReaction, tvReplySnippet;
        LinearLayout layoutReplyPreview;

        IncomingViewHolder(@NonNull View itemView) {
            super(itemView);
            tvAvatarMonogram = itemView.findViewById(R.id.tv_avatar_monogram);
            tvSenderName = itemView.findViewById(R.id.tv_sender_name);
            tvSenderUsername = itemView.findViewById(R.id.tv_sender_username);
            tvRoleBadge = itemView.findViewById(R.id.tv_role_badge);
            tvRemoteBadge = itemView.findViewById(R.id.tv_remote_badge);
            tvMessageContent = itemView.findViewById(R.id.tv_message_content);
            tvTime = itemView.findViewById(R.id.tv_time);
            tvReaction = itemView.findViewById(R.id.tv_reaction);
            tvReplySnippet = itemView.findViewById(R.id.tv_reply_snippet);
            layoutReplyPreview = itemView.findViewById(R.id.layout_reply_preview);
        }

        void bind(Message msg, OnMessageClickListener listener) {
            String name = msg.getSenderDisplayName();
            tvSenderName.setText(name);
            tvSenderUsername.setText("@" + msg.getSenderUsername());

            String firstLetter = name != null && !name.isEmpty() ? name.substring(0, 1) : "M";
            tvAvatarMonogram.setText(firstLetter);

            if ("owner".equalsIgnoreCase(msg.getSenderRole())) {
                tvRoleBadge.setVisibility(View.VISIBLE);
                tvRoleBadge.setText("مالک");
            } else if ("admin".equalsIgnoreCase(msg.getSenderRole())) {
                tvRoleBadge.setVisibility(View.VISIBLE);
                tvRoleBadge.setText("مدیر");
            } else {
                tvRoleBadge.setVisibility(View.GONE);
            }

            if (msg.isRemote()) {
                tvRemoteBadge.setVisibility(View.VISIBLE);
            } else {
                tvRemoteBadge.setVisibility(View.GONE);
            }

            if (msg.getReplySnippet() != null && !msg.getReplySnippet().isEmpty()) {
                layoutReplyPreview.setVisibility(View.VISIBLE);
                tvReplySnippet.setText("پاسخ به: " + msg.getReplySnippet());
            } else {
                layoutReplyPreview.setVisibility(View.GONE);
            }

            tvMessageContent.setText(formatMessageContent(msg.getContent()));
            tvTime.setText(msg.getFormattedTime());

            if (msg.getReactionsCount() > 0) {
                tvReaction.setVisibility(View.VISIBLE);
                tvReaction.setText("❤️ " + msg.getReactionsCount());
            } else {
                tvReaction.setVisibility(View.GONE);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) listener.onMessageReply(msg);
            });

            itemView.setOnLongClickListener(v -> {
                if (listener != null) listener.onMessageReact(msg);
                return true;
            });
        }
    }

    static class OutgoingViewHolder extends RecyclerView.ViewHolder {
        TextView tvMessageContent, tvTime, tvReaction, tvReplySnippet;
        LinearLayout layoutReplyPreview;

        OutgoingViewHolder(@NonNull View itemView) {
            super(itemView);
            tvMessageContent = itemView.findViewById(R.id.tv_message_content);
            tvTime = itemView.findViewById(R.id.tv_time);
            tvReaction = itemView.findViewById(R.id.tv_reaction);
            tvReplySnippet = itemView.findViewById(R.id.tv_reply_snippet);
            layoutReplyPreview = itemView.findViewById(R.id.layout_reply_preview);
        }

        void bind(Message msg, OnMessageClickListener listener) {
            if (msg.getReplySnippet() != null && !msg.getReplySnippet().isEmpty()) {
                layoutReplyPreview.setVisibility(View.VISIBLE);
                tvReplySnippet.setText("پاسخ به: " + msg.getReplySnippet());
            } else {
                layoutReplyPreview.setVisibility(View.GONE);
            }

            tvMessageContent.setText(formatMessageContent(msg.getContent()));
            tvTime.setText(msg.getFormattedTime());

            if (msg.getReactionsCount() > 0) {
                tvReaction.setVisibility(View.VISIBLE);
                tvReaction.setText("❤️ " + msg.getReactionsCount());
            } else {
                tvReaction.setVisibility(View.GONE);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) listener.onMessageReply(msg);
            });

            itemView.setOnLongClickListener(v -> {
                if (listener != null) listener.onMessageReact(msg);
                return true;
            });
        }
    }
}
