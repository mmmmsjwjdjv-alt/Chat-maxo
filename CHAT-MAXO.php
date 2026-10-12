<?php
// MAXO CHAT — اسکریپت ساده و سبک PHP جهت فعال‌سازی ویرایش آنلاین با رمز MAXO
// کافیست این فایل را در همان پوشه کنار CHAT-MAXO.json روی هاست خود قرار دهید.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Edit-Password, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$jsonFile = __DIR__ . '/CHAT-MAXO.json';
$secretPassword = 'MAXO';

// دریافت پیام‌ها (GET)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($jsonFile)) {
        echo file_get_contents($jsonFile);
    } else {
        echo json_encode([], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// ثبت پیام با رمز عبور MAXO (POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    $providedPassword = $_SERVER['HTTP_X_EDIT_PASSWORD'] ?? ($input['password'] ?? '');

    if ($providedPassword !== $secretPassword) {
        http_response_code(403);
        echo json_encode(['error' => 'رمز عبور ویرایش نامعتبر است'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $messages = $input['messages'] ?? [];
    file_put_contents($jsonFile, json_encode($messages, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

    echo json_encode([
        'success' => true,
        'message' => 'پیام با موفقیت در CHAT-MAXO.json ذخیره شد',
        'count' => count($messages)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
