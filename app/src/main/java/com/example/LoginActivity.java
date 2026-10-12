package com.example;

import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.example.auth.AccountManager;

public class LoginActivity extends AppCompatActivity {
    private boolean isLoginMode = true;
    private Button tabLogin, tabRegister, btnSubmit;
    private EditText etUsername, etDisplayName, etPassword, etConfirmPassword;
    private TextView tvLabelDisplayName, tvLabelConfirmPassword, tvError;
    private AccountManager accountManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        accountManager = AccountManager.getInstance(this);
        if (accountManager.isLoggedIn()) {
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_login);

        tabLogin = findViewById(R.id.tab_login);
        tabRegister = findViewById(R.id.tab_register);
        btnSubmit = findViewById(R.id.btn_submit);
        etUsername = findViewById(R.id.et_username);
        etDisplayName = findViewById(R.id.et_display_name);
        etPassword = findViewById(R.id.et_password);
        etConfirmPassword = findViewById(R.id.et_confirm_password);
        tvLabelDisplayName = findViewById(R.id.tv_label_display_name);
        tvLabelConfirmPassword = findViewById(R.id.tv_label_confirm_password);
        tvError = findViewById(R.id.tv_error);

        tabLogin.setOnClickListener(v -> setMode(true));
        tabRegister.setOnClickListener(v -> setMode(false));

        btnSubmit.setOnClickListener(v -> handleSubmit());
    }

    private void setMode(boolean isLogin) {
        this.isLoginMode = isLogin;
        tvError.setVisibility(View.GONE);

        if (isLogin) {
            tabLogin.setBackgroundTintList(ColorStateList.valueOf(Color.WHITE));
            tabLogin.setTextColor(Color.BLACK);

            tabRegister.setBackgroundTintList(ColorStateList.valueOf(Color.TRANSPARENT));
            tabRegister.setTextColor(ContextCompat.getColor(this, R.color.gray_text));

            tvLabelDisplayName.setVisibility(View.GONE);
            etDisplayName.setVisibility(View.GONE);
            tvLabelConfirmPassword.setVisibility(View.GONE);
            etConfirmPassword.setVisibility(View.GONE);

            btnSubmit.setText("ورود به حساب");
        } else {
            tabRegister.setBackgroundTintList(ColorStateList.valueOf(Color.WHITE));
            tabRegister.setTextColor(Color.BLACK);

            tabLogin.setBackgroundTintList(ColorStateList.valueOf(Color.TRANSPARENT));
            tabLogin.setTextColor(ContextCompat.getColor(this, R.color.gray_text));

            tvLabelDisplayName.setVisibility(View.VISIBLE);
            etDisplayName.setVisibility(View.VISIBLE);
            tvLabelConfirmPassword.setVisibility(View.VISIBLE);
            etConfirmPassword.setVisibility(View.VISIBLE);

            btnSubmit.setText("ساخت حساب کاربری");
        }
    }

    private void handleSubmit() {
        tvError.setVisibility(View.GONE);
        String username = etUsername.getText().toString().trim();
        String password = etPassword.getText().toString();

        if (username.isEmpty() || password.isEmpty()) {
            showError("لطفاً نام کاربری و رمز عبور را وارد نمایید");
            return;
        }

        try {
            if (isLoginMode) {
                accountManager.login(username, password);
                startActivity(new Intent(this, MainActivity.class));
                finish();
            } else {
                String confirm = etConfirmPassword.getText().toString();
                if (!password.equals(confirm)) {
                    showError("رمز عبور و تکرار آن یکسان نیستند");
                    return;
                }
                String display = etDisplayName.getText().toString().trim();
                accountManager.register(username, password, display);
                startActivity(new Intent(this, MainActivity.class));
                finish();
            }
        } catch (Exception e) {
            showError(e.getMessage());
        }
    }

    private void showError(String msg) {
        tvError.setText(msg);
        tvError.setVisibility(View.VISIBLE);
    }
}
