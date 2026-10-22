# 平板測試版 SSH 權限稽核（2026-10-22）

正式 SSH 憑證的發布條件仍為 **BLOCKED**。本次完成來源追溯與權限路徑稽核，
沒有修改執行中的應用程式邏輯，也沒有更換平板正在測試的 APK。

## 版本與證據範圍

APK 的 source snapshot 是
[`1721694d`](https://github.com/rs-assistant/Acode/commit/1721694d5f4f095552f7d78a32ce9c0953ac060e)，
完整檔案、bundle、native source 與公開簽章憑證的校驗碼見
[tablet-apk-provenance.json](tablet-apk-provenance.json)。

這是回溯保存的來源快照，不是可保證逐位元重現或經簽署的 build attestation。
已確認 APK 主 bundle 與保留的建置輸出相同，四個關鍵 Java 檔案與產生專案相同；
沒有以反編譯方式獨立驗證 APK 的 DEX。

遠端 `security/ssh-native-hardening` 的 `266cf643` 另外有 17 個 commit，
包括備份限制、plugin token reset、加密儲存 fail-closed、私鑰 buffer 清除與文件。
這些不在這個平板 APK 裡。為了固定測試對象，本次沒有把它們混進 source snapshot。

## 稽核結果

| 等級 | 路徑 | 已取得的證據 |
| --- | --- | --- |
| P0 | 公開 `fs`／`fsOperation` 代用 SFTP 權限 | 實際 app JS + dummy native transport 重現 saved-profile 登入與既有連線操作 |
| P0 | 公開 Cordova provider 洩漏 wire capability | 實際 Cordova exec/provider + app JS 重現；capability 已快取時仍可攔截 |
| P0 | `Tee` 的 plugin ID 可選到 SSH preference namespace | 編譯實際 `Tee.java`，以 dummy preference adapter 重現選取與讀取 |
| P1 | reset 沒有撤銷已發出的 plugin token | 實際 `Tee.java` + dummy adapter 重現 reset 後仍可讀取 |
| P1 | plugin secret accessor 允許明文 fallback | 實際 `Tee.java` 呼叫參數重現；Android fallback 寫入本身未執行 |
| P1 | terminal 公開 API 可到達內建 SSH component | 已追蹤原始碼；尚未執行完整 UI／裝置重現 |
| P1 | APK 未明確禁止備份、未綁定 data extraction 規則，允許 cleartext | 實際 APK Manifest 檢查 |

### 公開 filesystem 是 confused deputy

`src/lib/acode.js` 將同一個 `fsOperation` 公開為 `fs` 與 `fsOperation`，
`require()` 沒有 caller／plugin 權限分流。`src/fileSystem/index.js` 又直接註冊
`Sftp.fromUrl`。第三方 plugin 因此可拿到和內建檔案瀏覽器相同的 SFTP wrapper。

測試在 app 完成 trusted-session 初始化後，呼叫
`fsOperation("sftp://profile-dummy/dummy.txt").stat()`，
確認私有 wrapper 會加上 app capability。已連線時直接使用該連線，
未連線時會呼叫 `connectUsingProfile`。plugin 不需要持有 `window.sftp`。
profile ID 不是憑證，且可從同 realm 的 storage／recent URL 取得。

這證明 JS 到 native dispatch 的授權代用；實際 Android SSH 建連仍需裝置與 dummy server 驗證。

### provider 攔截不需要搶先建立 session

`src/lib/pluginContext.js` 只將數個 `cordova` property 設成不可重新指定。
Cordova 的公開 `cordova/android/nativeapiprovider` module 仍提供 `get()`／`set()`；
實際 `cordova/exec` 每次呼叫會透過 provider 送出序列化參數。

測試先讓 app 建立 session，再從 plugin 可達的 provider 安裝攔截器，
可觀察到新 capability 的 session 參數，以及後續 SFTP call 的 capability。
即使 capability 在 plugin 載入前已快取，後續 wire call 仍帶有它。
dummy native gate 會拒絕沒有 capability 的直接呼叫，但接受重放已攔截的 capability。

因此僅隱藏 global、捕捉 exec function reference 或鎖定 `cordova.exec` 不足以建立 caller 身分。
測試執行的是 npm 安裝的 Cordova 原始 module；Java bridge 與瀏覽器事件為替身。

### preference namespace 可導向 SSH credential store

`Tee.requestToken` 取得有效 session 後，接受傳入的 plugin ID。
`get_secret` 等操作直接將該 ID 用作 `EncryptedPreferenceManager` 的 preference 名稱。
`SftpSecurityStore` 使用固定名稱 `acode_sftp_profiles_v1` 儲存 profile。

Java harness 使用實際 `Tee.java`：先確認錯誤 session 被拒絕，再以有效 session
要求上述名稱的 token，接著成功從 dummy store 讀出 `profile-dummy` 的 dummy 密碼 JSON。
JS provider 測試已獨立證明 session／capability 參數可被觀察，這使 namespace 路徑
構成嚴重的 credential 存取風險。host-key store 名稱也必須列入隔離設計。

此 harness 只驗證 native dispatch、namespace 與 token 生命週期；
Android Context、Cordova callback 與 preference storage 是替身，沒有執行真實 Keystore 解密。
真正裝置的跨 namespace 解密讀取仍需專用 dummy profile 測試。

### 其餘差異

- `Tee.onReset` 清掉 session 與 SFTP capability，沒有清除 plugin token／permission maps。
  harness 確認既有 token 在 reset 後仍可使用。
- `Tee` 四個 secret 操作使用兩參數 preference constructor；真實 constructor 預設允許
  plaintext fallback。harness 驗證選擇了此參數；沒有模擬或觸發實際 Android 加密故障。
- `acode.require("terminal")` 暴露 create/get/getAll；get/getAll 回傳含 component 的原物件。
  `create` 的 options 可到達 `remoteSsh`，component 的 `write()` 直接呼叫 native shell wrapper。
  必須連同 filesystem 一起隔離，不能把 command pattern filter 視為授權。
- APK Manifest 只有 network-security 設定與 `usesCleartextTraffic=true`，
  未見明確的 `allowBackup=false` 或 `dataExtractionRules`。
- private-key decode buffer 清除與 token/manifest 驗證順序的遠端修正也尚未納入。

## 執行結果

```bash
npm test -- tests/security/ssh-boundary-audit.test.js
# JDK 21、curl、sha256sum；第一次下載固定版本且校驗過的 org.json jar
bash tests/security/native-audit/run.sh
```

- source snapshot 固定前：91 個測試檔通過、1 個略過；811 tests 通過、1 個略過。
  `npm run typecheck` 通過。
- 加入 JS audit 後的完整 Vitest：92 個測試檔通過、1 個略過；816 tests 通過、1 個略過。
- 其中 5 個 JS audit case 是 1 個 control 與 4 個已知弱點重現。
- Java harness：4 個檢查完成，包含 1 個拒絕錯誤 session 的 control 與 3 個弱點重現。
- 修改的 JS audit 檔案通過 Biome；shell script 通過 Bash syntax check。

**弱點重現測試通過表示攻擊路徑在這個受控模型中成功，並非隔離驗證通過。**
這些測試不是 production release gate 的通過條件；修正後應改為拒絕攻擊的 assertions。
沒有執行 Android 裝置攻擊、真實 SSH exec／上下載、Keystore 故障或正式 credential 測試。

## 下一階段修正順序

1. 基於遠端安全分支保留既有 17 個 commit，再整合 source snapshot 的原生 bridge 變更；
   解決測試衝突時保留 release gate，不以刪除負向測試換取綠燈。
2. 決定可強制執行的 plugin／SSH 邊界。完整方案應有隔離 realm／process 與受控 IPC，
   並關閉 filesystem、terminal 等 confused-deputy 路徑。
   安全的過渡方案是 saved-credential SSH 啟用時，從啟動階段禁止所有第三方 plugin 載入；
   已執行過 plugin 的 realm 需重建，不能只移除 script tag 或顯示 UI 提示。
3. plugin secret store 使用獨立 namespace 映射，拒絕 app-owned store 名稱，
   授權與 permission check 在 native 執行，並確實撤銷 token。
   只修 namespace 或凍結 provider 都不足以完成整個隔離目標。
4. 補上備份／資料移轉、fail-closed、錯誤與 logging 等修正後，建置新的可追溯 APK。
5. 在專用 dummy SSH server、Android 裝置上重跑惡意 plugin 測試，
   同時確認內建 SFTP、終端、多主機、鍵盤與 DeX 功能。

目前平板可繼續做 UI 與 dummy 帳號測試；不要使用正式 SSH 密碼／私鑰，
不要把本次 mock／stub 的結果當作裝置安全性證明。
