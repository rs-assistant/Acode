# Acode 個人測試版 — 2026-10-27

[下載 APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-apk-20261027/acode-ssh-safe-fbc734a5-debug.apk)

此分支只放測試 APK、安裝說明與校驗資料，不合併到 main。
本 APK 包含 SSH 安全模式、原生金鑰產生、儲存失敗防護、依賴更新、
終端串流驗證與僅限本機的內建預覽；仍不是正式 SSH 安全發布。

## 平板安裝

1. 用瀏覽器下載上方 APK，開啟「我的檔案 → 下載」並點選 APK。
2. 如 Android 要求，僅替下載使用的瀏覽器／檔案管理員允許「安裝未知應用程式」。
3. 選「更新」，完成後可關閉剛開啟的安裝權限。

套件為 `com.foxdebug.acode`、版本 `1.13.5`（1011），沿用之前測試版的 Debug
簽章，預期可覆蓋更新，正常更新會保留應用程式資料。新版升級相容性尚未
做實機驗證，請先備份重要編輯檔案。

**若提示簽章不符或要求先解除安裝，停止操作，不要刪除舊版。**
舊測試下載分支保留，不會被此分支覆寫。

## 來源與核對

- Source: `security/ssh-native-hardening` at `fbc734a5c440856c95e8ff91846c527a4567efcd`。
- APK：49,405,356 bytes；完整 SHA-256 見 `SHA256SUMS`。
- 公開簽章憑證 SHA-256：
  `c6a811233830332c03851f95b3487faa7e4bde3b93f854b9cf4d8cb2a7969351`。
- 最近本機檢查：978 JS 測試、型別檢查、35 項終端迴圈連線、13 項預覽監聽
  檢查通過；Android 建置、apksigner、SDK 與 zip alignment 核對通過。
- 這些不是 Android 實機、真實 Keystore、升級或完整惡意外掛驗收。
  Preview 同機授權／並行請求及其他列於 source security 文件的限制仍存在。

此交付未使用 GitHub Secrets 上傳 API；簽章私鑰與任何 token 都不在此分支。
請先使用測試帳號，不要把此 Debug 測試版視為已批准可存放正式 SSH 憑證。
