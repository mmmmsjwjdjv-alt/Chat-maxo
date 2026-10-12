package com.example.network;

import android.os.Handler;
import android.os.Looper;
import com.example.model.Message;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MaxoJsonService {
    public static final String DEFAULT_ENDPOINT_URL = "https://tk-server.ir/json/CHAT-MAXO.json";
    private static final int TIMEOUT_MILLIS = 8000;

    private static MaxoJsonService instance;
    private final ExecutorService executor;
    private final Handler mainHandler;
    private String endpointUrl = DEFAULT_ENDPOINT_URL;

    public interface FetchCallback {
        void onSuccess(List<Message> messages, String rawResponse);
        void onError(String errorMessage);
    }

    public interface WriteCheckCallback {
        void onResult(boolean isWritable, String technicalExplanation);
    }

    private MaxoJsonService() {
        this.executor = Executors.newFixedThreadPool(2);
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public static synchronized MaxoJsonService getInstance() {
        if (instance == null) {
            instance = new MaxoJsonService();
        }
        return instance;
    }

    public String getEndpointUrl() {
        return endpointUrl;
    }

    public void setEndpointUrl(String url) {
        if (url != null && !url.trim().isEmpty()) {
            this.endpointUrl = url.trim();
        }
    }

    /**
     * Asynchronously fetches and parses messages from the primary remote JSON endpoint
     */
    public void fetchRemoteMessages(FetchCallback callback) {
        executor.execute(() -> {
            int retries = 2;
            Exception lastException = null;

            while (retries >= 0) {
                HttpURLConnection connection = null;
                try {
                    URL url = new URL(endpointUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(TIMEOUT_MILLIS);
                    connection.setReadTimeout(TIMEOUT_MILLIS);
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setRequestProperty("User-Agent", "MAXO-CHAT-Android/1.0");

                    int responseCode = connection.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_OK) {
                        InputStream in = connection.getInputStream();
                        BufferedReader reader = new BufferedReader(new InputStreamReader(in));
                        StringBuilder builder = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            builder.append(line);
                        }
                        reader.close();

                        String responseBody = builder.toString().trim();
                        List<Message> parsedList = parseMessagesJson(responseBody);

                        mainHandler.post(() -> callback.onSuccess(parsedList, responseBody));
                        return;
                    } else {
                        throw new Exception("سرور پاسخ HTTP با کد " + responseCode + " ارسال نمود");
                    }
                } catch (Exception e) {
                    lastException = e;
                    retries--;
                    if (retries >= 0) {
                        try {
                            Thread.sleep(1000);
                        } catch (InterruptedException ignored) {}
                    }
                } finally {
                    if (connection != null) {
                        connection.disconnect();
                    }
                }
            }

            final String errText = lastException != null ? lastException.getMessage() : "خطای ناشناخته شبکه";
            mainHandler.post(() -> callback.onError("خطا در برقراری ارتباط با " + endpointUrl + ": " + errText));
        });
    }

    public interface PostCallback {
        void onSuccess(String message);
        void onNotice(String notice);
    }

    /**
     * Attempts to send the message to the remote endpoint using the secret edit password MAXO
     */
    public void postMessageWithPassword(Message newMessage, List<Message> currentMessages, PostCallback callback) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(endpointUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(TIMEOUT_MILLIS);
                connection.setReadTimeout(TIMEOUT_MILLIS);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                connection.setRequestProperty("X-Edit-Password", "MAXO");
                connection.setRequestProperty("Authorization", "Bearer MAXO");
                connection.setRequestProperty("User-Agent", "MAXO-CHAT-Android/1.0");

                // Prepare combined JSON payload
                JSONArray messageArray = new JSONArray();
                for (Message m : currentMessages) {
                    messageArray.put(m.toJson());
                }
                messageArray.put(newMessage.toJson());

                JSONObject payload = new JSONObject();
                payload.put("password", "MAXO");
                payload.put("messages", messageArray);

                byte[] bytes = payload.toString().getBytes("UTF-8");
                connection.getOutputStream().write(bytes);
                connection.getOutputStream().flush();

                int code = connection.getResponseCode();
                if (code == 200 || code == 201) {
                    mainHandler.post(() -> callback.onSuccess("پیام با رمز MAXO به آدرس سرور ارسال شد."));
                } else {
                    mainHandler.post(() -> callback.onNotice("سرور کد " + code + " بازگرداند. پیام به صورت محلی در دستگاه شما حفظ شد."));
                }
            } catch (Exception e) {
                mainHandler.post(() -> callback.onNotice("ارتباط مستقیم با سرور با خطا مواجه شد: " + e.getMessage()));
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    public void verifyWriteCapability(WriteCheckCallback callback) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(endpointUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(TIMEOUT_MILLIS);
                connection.setReadTimeout(TIMEOUT_MILLIS);
                connection.setDoOutput(true);
                connection.setRequestProperty("X-Edit-Password", "MAXO");
                connection.setRequestProperty("Authorization", "Bearer MAXO");

                int code = connection.getResponseCode();
                mainHandler.post(() -> callback.onResult(code == 200 || code == 201,
                    "پاسخ سرور با رمز MAXO: کد HTTP " + code + (code == 200 ? " (ارتباط برقرار شد)" : "")));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onResult(false, "خطا در برقراری ارتباط با سرور: " + e.getMessage()));
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    private List<Message> parseMessagesJson(String jsonStr) {
        List<Message> list = new ArrayList<>();
        if (jsonStr == null || jsonStr.isEmpty()) return list;

        try {
            if (jsonStr.startsWith("[")) {
                JSONArray arr = new JSONArray(jsonStr);
                for (int i = 0; i < arr.length(); i++) {
                    Object item = arr.get(i);
                    if (item instanceof JSONObject) {
                        Message msg = Message.fromJson((JSONObject) item, true);
                        if (msg != null && msg.getContent() != null && !msg.getContent().isEmpty()) {
                            list.add(msg);
                        }
                    }
                }
            } else if (jsonStr.startsWith("{")) {
                JSONObject root = new JSONObject(jsonStr);
                if (root.has("messages")) {
                    JSONArray arr = root.getJSONArray("messages");
                    for (int i = 0; i < arr.length(); i++) {
                        Message msg = Message.fromJson(arr.getJSONObject(i), true);
                        if (msg != null) list.add(msg);
                    }
                }
            }
        } catch (Exception ignored) {}

        return list;
    }
}
