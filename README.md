# Acode SSH 安全模式測試版 — 2026-10-22

[下載新版測試 APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-apk-20261022/acode-ssh-safe-e1b32fc7-debug.apk)

這是獨立的 APK 下載分支，不是程式碼分支。舊版 `test/tablet-apk` 的檔案、
校驗碼與下載連結均未更動。新版尚未完成 Android 實機安全驗證，請只用測試帳號，
不要匯入正式 SSH 密碼、私鑰或 token。

## 平板安裝

1. 先備份工作檔案與編輯器設定；不要為了測試匯出或分享正式憑證。
2. 在 Chrome 點上方下載連結，再到「我的檔案 → 下載」開啟 APK。
3. 若 Android 提示，暫時允許該瀏覽器／檔案管理器安裝未知應用程式。
4. 選擇更新／安裝。安裝完成後，可關閉剛才的未知來源安裝權限。
5. 到系統設定將 Acode「強制停止」，再重新開啟，確保使用全新的 WebView。

如果連結沒開始下載，開啟 [GitHub 檔案頁](https://github.com/rs-assistant/Acode/blob/test/ssh-safe-apk-20261022/acode-ssh-safe-e1b32fc7-debug.apk)，
選擇 **Download raw file**。

新版與先前提供的測試 APK 使用相同 package ID、版本號、versionCode 及簽章憑證，
具備覆蓋更新的必要條件，但尚未實測升級。兩者都顯示 1.13.5，請以下載檔名及
「外掛」頁中的 SSH 安全模式提示辨識新版。

若出現「應用程式未安裝／套件衝突／簽章不同」，**不要先解除安裝**；
保留資料並回報完整畫面。Play 商店或其他來源的 Acode 可能有不同簽章。

## 本版變更與限制

- 固定停用所有第三方外掛，包含外掛主題與下載式 Eruda 開發工具；
  內建編輯器、SSH／SFTP、終端仍保留。沒有執行中的重新啟用開關。
- 已安裝外掛與設定不會因此刪除或標為損壞。舊第三方外掛秘密儲存區
  不會自動遷移／讀取；SSH profile 與 known-host 格式未變。
- `allowBackup=false`，雲端備份與裝置移轉的各資料區皆排除。
  這也會影響編輯器應用程式資料的備份，請另外保存工作檔案。
- 錯誤訊息／日誌減少例外細節，並更新預覽與部分建置依賴。
- 仍有依賴風險與 cleartext 設定；不要預覽不可信的數學／圖表文件。
  詳見 [依賴稽核](https://github.com/rs-assistant/Acode/blob/e1b32fc7e72dd0a36cea1454338f4be3fbbfa38c/security/dependency-audit.md)。

## 請先回報這幾項

1. 能否覆蓋安裝、冷啟動，並正常開啟／編輯／儲存一般檔案？
2. 「外掛」頁是否顯示 SSH 安全模式，原有外掛／外掛主題是否未執行？
3. 以專用測試 SSH 帳號檢查 SFTP 連線、終端、上下載與重新連線；
   若出現未知／變更主機金鑰提示，不要跳過驗證。

回報平板型號、Android 版本、操作步驟與錯誤畫面即可，不要附密碼或私鑰。
完整的安全驗收還包括惡意外掛、升級、重載、主機金鑰與多主機測試，
上述基本操作通過不代表全部安全驗證完成。

## 來源與校驗

- 精確來源：[`e1b32fc7`](https://github.com/rs-assistant/Acode/commit/e1b32fc7e72dd0a36cea1454338f4be3fbbfa38c)。
- Paid Debug，package `com.foxdebug.acode`，版本 1.13.5，versionCode 1011。
- minSdk 26、targetSdk 36、compileSdk 36。建置時明確指定
  `TMPDIR` 內 `fdroid.bool=false`，避免 hook 缺旗標時預設降到 target 28。
- APK：45,842,546 bytes；SHA-256：
  `f2ce0277a237afcefb27bcbc92a676a5e6ffb84f7a15adbdaf19657c4bfae0b5`。
- 本輪執行：844 項 JS 測試、34 項 Tee 與 11 項錯誤清理原生斷言、
  typecheck、Android Debug 建置與 APK 簽章驗證通過。
- 未執行：Android 實機／模擬器安全與升級測試；GitHub CI 尚無執行紀錄。

見 `PROVENANCE.json` 與 `SHA256SUMS`。這是本機建置驗證記錄，不是第三方簽署的
建置證明；Debug 憑證亦不是正式 Release 簽署。測試通過不代表可使用正式憑證。
