# SSH 安全模式：指紋對話框按鈕修正版

[下載修正版 APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-apk-20261022-dialog-fix/acode-ssh-safe-ffb1bfd1-debug.apk)

修正未知主機指紋、主機金鑰變更、刪除儲存憑證這三種原生對話框的主題。
不再沿用應用程式的白色強調色，改為原生 Material 淺色／深色對話框。
指紋核對、信任／取消與主機金鑰變更時的拒絕連線行為皆不變，沒有跳過驗證。
修正後的按鈕可見性仍需要平板實測，不能把編譯成功當作 UI 驗證通過。

舊的 `test/tablet-apk` 與首版 `test/ssh-safe-apk-20261022` 均未變更。
本分支只有 APK、校驗碼、來源驗證記錄與本說明，不應合併到 main。

## 安裝

先備份工作檔案，再開啟下載的 APK 更新；與前兩版測試 APK 使用相同 package ID、
版本號及簽章，但實際升級仍待平板確認。**不要先解除安裝**；若安裝失敗，請回報畫面。
若需要未知來源安裝權限，僅暫時允許下載用瀏覽器／檔案管理器，完成後可關閉。
更新後到 Android 設定強制停止 Acode，再重新開啟。

如果直接連結沒下載，開啟 [GitHub 檔案頁](https://github.com/rs-assistant/Acode/blob/test/ssh-safe-apk-20261022-dialog-fix/acode-ssh-safe-ffb1bfd1-debug.apk)
並選擇 Download raw file。

## 金鑰登入

1. 使用專用測試金鑰。先把對應的 **公鑰**（`.pub`）設到伺服器測試帳號的
   `~/.ssh/authorized_keys`，確認權限正確且伺服器允許公鑰登入。
2. 在 Acode 檔案瀏覽器首頁，長按 SFTP 連線 → 編輯。
3. Authentication type 選「金鑰檔案」，選取 **私鑰**，如 `id_ed25519` 或
   `id_rsa`，不是 `.pub`。若私鑰有通行密碼，填的是私鑰的 passphrase，
   不是伺服器登入密碼；沒有才留空。
4. 儲存連線。核對伺服器主機金鑰指紋仍然必要，不能因為使用私鑰就略過。

請勿提供正式私鑰／密碼，也不要貼到聊天中。原始私鑰檔案不會在匯入後自動刪除，
請保管好原檔。其他格式（例如 PuTTY `.ppk`）尚未在平板驗證。

## 請回報

- 明／暗模式中，指紋對話框的 Cancel、Trust and connect 是否清楚可見？
- 取消能否拒絕連線；核對正確指紋後接受能否繼續連線？
- 測試私鑰（含 passphrase）的 SFTP 與 SSH 終端登入是否成功？

不要刪除既有 trusted-host 記錄來強迫出現提示，也不要盲點看不見的按鈕。
必要時用另一個受控的測試端點；遇到主機金鑰變更請先獨立核對，不要直接信任。
若仍看不到按鈕，請截完整對話框（含底部），並提供平板／Android 版本及是否為深色模式。

## 驗證記錄

- 精確來源：[`ffb1bfd1`](https://github.com/rs-assistant/Acode/commit/ffb1bfd1764a96e2b04b44a96b3c9c554cd7595d)。
- 845 項 JS 測試、34 + 11 + 6 項原生斷言、typecheck 與 Android Debug 建置通過。
- 原生斷言使用測試 adapter；6 項新增斷言只驗證主題選擇，沒有渲染 Android UI。
- Paid Debug，`com.foxdebug.acode`，1.13.5 / versionCode 1011。
- min/target/compile SDK：26/36/36。明確提供 `fdroid.bool=false` 的 TMPDIR。
- 45,842,546 bytes；SHA-256：
  `2f0e90c27b9940c889024de73439109c55a5932a6ab6aab9cac5d33cb1e486d2`。

詳見 `PROVENANCE.json`、`SHA256SUMS`。仍有未完成的安全／實機測試與依賴風險，
只用測試帳號和測試金鑰；不是正式憑證安全發布。
