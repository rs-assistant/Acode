# Acode：平板本機產生 SSH 金鑰測試版

[下載金鑰產生版 APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-keygen-20261022/acode-ssh-keygen-96a37beb-debug.apk)

不需要電腦、Termux 或另外安裝終端，就能在平板產生 Ed25519／RSA-4096。
這仍是測試版：先使用專用測試帳號／測試金鑰，**保留原有登入方式**，
不要在新金鑰成功登入前刪除密碼或舊公鑰。所有第三方外掛仍停用。

## 安裝

先備份工作檔案，再開啟 APK 覆蓋更新。與先前測試版的 package ID、版本號、
versionCode 及 Debug 簽章相同；實際升級仍需你的平板確認。
若安裝失敗請回報截圖，**不要先解除安裝**。更新後強制停止 Acode，再重新開啟。
若需暫時允許未知來源安裝，完成後可把瀏覽器／檔案管理器的該項權限關閉。

直接連結沒開始下載時，開啟 [GitHub 檔案頁](https://github.com/rs-assistant/Acode/blob/test/ssh-safe-keygen-20261022/acode-ssh-keygen-96a37beb-debug.apk)，
選 Download raw file。前面三版下載分支均未更動，本分支不應合併至 main。

## 使用步驟

1. 「檔案瀏覽器」首頁 → **＋ → SSH 金鑰 → 產生 SSH 金鑰**。
2. 先選 Ed25519，或選 RSA-4096，輸入方便辨識的名稱。
3. 按 **複製公鑰**。透過原本可用的登入方式，到伺服器對應帳號的
   `~/.ssh/authorized_keys` **新增一行**公鑰；保留原內容，不要覆蓋整份檔案。
   公鑰授權與檔案權限依你的伺服器設定；本 app 不會自動改伺服器。
4. 返回檔案瀏覽器，長按 SFTP 連線 → 編輯 → Authentication type 選
   **已儲存 SSH 金鑰**，再按「選擇已儲存的 SSH 金鑰」欄位選剛才的名稱。
5. 儲存後測試連線、傳檔及 Open SSH Terminal。伺服器主機金鑰指紋仍須獨立核對，
   不能因為使用帳號金鑰就跳過驗證。

原本的密碼／匯入私鑰檔案登入仍保留。請回報上述各步與重新開機後的結果；
錯誤可截圖，但不要貼私鑰、密碼或通行密碼。

## 金鑰保護與限制

- 私鑰只存在原生加密儲存區，不送到 JavaScript／剪貼簿／遠端生成服務。
  公鑰、名稱、演算法、指紋與 opaque ID 才會提供給畫面。
- 不提供私鑰匯出或備份；解除安裝、清除資料、裝置遺失可能使金鑰無法復原。
  因此一定保留另一種登入／恢復方式，且不要把本版當成唯一正式憑證來源。
- 產生的金鑰以 app 的 Android Keystore 加密儲存保護，不是另外設定私鑰檔密碼，
  也不宣稱每把 SSH 私鑰都是硬體內不可匯出的簽章金鑰。
- 最多 32 把，名稱 1–80 字元。刪除前有原生確認；刪除本機紀錄不會撤銷
  伺服器公鑰授權，也不會取消進行中的驗證或已登入的工作階段。
- 指紋與刪除對話框保留前版的原生明／暗主題修正；實際顯示仍待平板確認。

## 參考與驗證

依使用者指定，參考 [Android SSHBorg](https://github.com/payne1982/sshborg/tree/1388c99d0570c393dd4eb915c82b65d85b2aa1db)
的金鑰管理流程，未複製 GPL 程式碼；以 Acode 既有 Maverick／BC 實作，
不採用可關閉加密或明文 fallback 的行為。不是 SSHBorg 的全部功能移植。

- 精確來源：[`96a37beb`](https://github.com/rs-assistant/Acode/commit/96a37bebb99ae0478b25811d68944fd404d36dd1)。
- 完整 JS 測試 97 檔／866 項、typecheck，核心原生 52 項＋實際 crypto/vault 55 項斷言通過。
- 真實函式庫可產生並重新載入兩種金鑰、簽章／驗章，OpenSSH 可讀公鑰且指紋一致。
  測試儲存區仍是 adapter，不代表 Android Keystore 或實機 SSH 登入已驗證。
- Android Debug 建置／簽章驗證通過；package `com.foxdebug.acode`，1.13.5 / 1011。
- min/target/compile SDK：26/36/36；明確提供 `fdroid.bool=false` 的建置旗標。
- 45,842,855 bytes；SHA-256：
  `4449ccf1c7fc9e2275741d5790218508ec491eff6c9fcb29f10e0e5e693bfd43`。

詳見 `PROVENANCE.json`、`SHA256SUMS` 及
[設計／限制／測試紀錄](https://github.com/rs-assistant/Acode/blob/96a37bebb99ae0478b25811d68944fd404d36dd1/security/ssh-key-generation.md)。
尚待實機驗證，仍有依賴風險與 cleartext 設定；正式 SSH 憑證安全發布條件未通過。
