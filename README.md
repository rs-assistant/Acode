# Acode SSH-safe storage-failure test APK

[下載測試 APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-storage-20261022/acode-ssh-storage-8be13af6-debug.apk)

這是自用安全改進的 **Debug 測試版**，不是正式安全驗證或正式簽署發行版。
原有四個 APK 下載分支與 main 保留不變；本分支只放產物，不可合併至 main。

## 本次修正

- 儲存區寫入失敗後，同程序拒絕使用未確認的 SSH 憑證／主機信任快取。
- 刪除連線設定會檢查可靠寫入，不會在失敗時仍回報成功。
- 缺少暫存版本旗標時，不再悄悄降低 target SDK；實際 APK 為 36。
- 金鑰產生、既有已儲存金鑰、密碼與匯入金鑰流程保留；第三方外掛仍停用。

## 安裝與測試

1. 在 Android 平板下載 APK，直接覆蓋更新。套件、versionCode 1011 與 Debug
   簽章和前一個測試包相同；實際升級仍需裝置確認。若簽章衝突，保留原 App
   與資料、回報錯誤，不要先解除安裝。
2. 確認原本的檔案、已儲存金鑰與連線設定仍在；強制停止／重開後測試登入、
   SFTP 上下載與 SSH 終端。用測試帳號，不使用正式憑證。
3. 另產生一把一次性測試金鑰、用它建立測試連線。確認登入可用後刪除這把
   **測試金鑰**、斷開既有連線並重新連線，應拒絕登入，不可退回密碼。
   不要刪除唯一可用的金鑰。刪鍵不會終止已驗證 session，伺服器公鑰要另外移除。
4. 若儲存／信任／刪除回報失敗，先解決空間或儲存區問題，再強制停止／重開，
   檢查實際保存狀態並重新核對主機。不要以清除資料或解除安裝排錯。
   不建議為測試把平板儲存空間刻意塞滿。

私鑰目前不提供匯出或備份；保留另一種登入／復原方式。host-key 驗證不能略過。
尚待惡意外掛、主機金鑰變更、真實磁碟失敗與裝置 Keystore 等驗證；
依賴掃描仍有問題，production release gate 保持 BLOCKED。

## 校驗與來源

- SHA-256: `692e7f52489f6f41fbd848e532202f0678293d62cab92ff4b557064ea7c7c137`
- Bytes: 45842855
- Exact runtime source: [8be13af683dc8b353dda082aa1971ba34c374edd](https://github.com/rs-assistant/Acode/tree/8be13af683dc8b353dda082aa1971ba34c374edd)
- Local checks: 888 JS tests; 216 native/crypto-related assertions; typecheck,
  Android build, APK signature and package policy inspection passed.
- JVM Android/AndroidX adapters are not real-device encryption/durability tests.
  No remote CI success is claimed. Details in PROVENANCE.json and SHA256SUMS.
