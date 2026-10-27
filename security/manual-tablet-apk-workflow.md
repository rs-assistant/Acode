# 手動建置平板測試 APK

這是 `rs-assistant/Acode` 的個人 **Debug 測試版** 流程，不是正式 SSH 安全發布。
原本的平板下載分支、`main` 程式碼和舊 Release 均不由此流程覆寫。

## 啟用前的兩個條件

1. GitHub 要求 `workflow_dispatch` 的 workflow 先存在預設分支，才可手動觸發。
   此 fork 的預設分支是 `main`。目前修改先放在
   `security/ssh-native-hardening`，**不代表已啟用**。
   已建立只含此 workflow 的[啟用 PR #1](https://github.com/rs-assistant/Acode/pull/1)，
   尚未合併。審查後只將 `.github/workflows/manual-test-apk.yml` 納入 `main` 即可註冊，
   不必為了這一步把整條安全分支合併進去。若 fork 的 Actions 尚未啟用，
   也要先在 GitHub 的 Actions 分頁啟用。實際執行時一定選安全分支；選
   `main`、tag 或其他分支會跳過工作，不會建置舊版或任意 PR 程式碼。
2. 在 **GitHub Actions repository secrets** 設定以下值；不是 Codex 環境變數：

   - `ACODE_RELEASE_TOKEN`：使用者已回報設定。只有勾選上傳草稿 Release 才用到。
     Fine-grained PAT 限定此 repo、Contents: Read and write、短到期日即可；
     不需要為發布權杖額外開 Secrets 管理權限。
   - `ACODE_DEBUG_KEYSTORE_BASE64`：既有測試 APK 專用 Debug keystore 的 base64。
     使用者已同意沿用這把測試簽章，但 **尚未成功存入 GitHub**。
     Codex GitHub 整合查詢 repository Secrets public-key API 回傳 403，無法
     加密／設定此 secret；403 不是使用者既有發布 token 設定失敗的證據。

不要把 keystore、base64 或 token 貼進聊天、issue、commit、log 或 Actions artifact。
在持有原始 keystore 且已安全登入、具 Secrets 管理權限的可信任終端，可用：

```bash
base64 -w 0 /secure/path/to/existing-test-debug.keystore |
  gh secret set ACODE_DEBUG_KEYSTORE_BASE64 --repo rs-assistant/Acode
```

`base64 -w 0` 是 GNU/Linux 用法。直接管線傳送，不先印出內容；私鑰本身沒有
因為 base64 變得安全。Codex 現有原始檔在 `/workspace/.android-user/debug.keystore`，
不是使用者平板的路徑。這把是 APK 測試簽章，與 SSH 私鑰無關。
本流程只接受該既有 Debug key 的 `androiddebugkey` alias／標準 Debug 密碼，
且強制核對公開憑證指紋：

```text
c6a811233830332c03851f95b3487faa7e4bde3b93f854b9cf4d8cb2a7969351
```

缺少或不符時必須失敗；不自動產生新固定金鑰、不降低檢查、不要求解除安裝。
若無法安全存入原 key，先不要用另一把 key 發布相同 package 的更新 APK。

## 平板瀏覽器的操作

1. 前述啟用條件完成後，到 repo → **Actions → Manual tablet test APK**。
2. 點 **Run workflow**；分支選 `security/ssh-native-hardening`。
3. 預設不勾 `upload_release`：只產生可下載的 Actions artifact。
   勾選後才用 `ACODE_RELEASE_TOKEN` 新建 **draft prerelease**，不會自動公開。
4. 工作成功後，下載 `acode-tablet-<完整來源 SHA>-<run ID>-<attempt>` 產物，
   解壓後取 `.apk`。Actions artifact 下載需要 GitHub 登入，且保留 14 天。
   不要拿保留 1 天的 `intermediate-apk-*` 中間產物安裝：它不是交付用固定簽章。
5. 若有勾選上傳，到 **Releases** 查看新增草稿。草稿不是公開下載連結；
   檢查檔案與測試警告後，由使用者另外決定是否手動發布。不要把成功建置
   或手動公開測試檔解讀成正式 SSH 安全認證。

每次上傳使用 `tablet-test-<run ID>-<attempt>` 新名稱，指定精確來源 SHA；
不修改舊標籤、不刪舊檔、不使用 `--clobber`。同一執行的部分上傳失敗可能
留下未完成草稿；重新執行會使用不同 attempt，仍不覆蓋該草稿。

## 工作與權限邊界

- 只接受明確 repo／安全分支的 `workflow_dispatch`；沒有排程、push、
  `pull_request_target` 或自訂任意 source/tag/shell 輸入。
- 全部 actions 固定完整 commit；checkout 指定 dispatched SHA，不保留 Git
  credential。使用 Node 24、JDK 21、SDK/build-tools 36、Gradle 8.14.2。
- 建置 job 只有 Contents: read，沒有持久測試簽章或發布 token。
  `npm ci`、vendored bundle 比對、完整 JS／型別及現有原生測試先通過，
  再由可攜的 `utils/ci/build-test-apk.sh` 建置；不依賴雲端 workspace helper。
  腳本拒絕覆寫既有 Android 專案，另建 TMPDIR 避開遺留 F-Droid flag，
  核對 wrapper ZIP SHA-256，並確認 package／lockfile／config 沒被改寫。
- 第二個乾淨 runner 不 checkout 原始碼、不跑 npm、Gradle 或專案 hook。
  僅下載該次 APK，再用既有固定測試 key 重新簽章。
  此分離減少建置指令接觸持久 secret，不代表不可信 APK parser 完全無風險，
  更不會阻止有權修改 workflow／repo 的使用者變更這些控制。
- 簽章 secret 只注入還原步驟；重新簽章後驗證單一既有 signer、zip alignment、
  package `com.foxdebug.acode`、min SDK 26、target SDK 36。清除暫存 keystore
  的 `always()` 步驟在 artifact／Release 上傳之前執行，不快取或上傳金鑰。
- 輸出 APK SHA-256、公開簽章／package 資訊與來源／run metadata。
  metadata 明列未實機驗證、未批准正式用途；不是簽署的供應鏈 attestation，
  也不宣稱與舊雲端 APK 位元完全相同。
- `ACODE_RELEASE_TOKEN` 只注入最後的選用草稿上傳步驟。來源、執行 ID 等
  由環境變數取得，不把可輸入文字直接拼入 shell。沒有自動正式發布選項。
  舊 `/workspace/acode-cloud/upload-apk.sh` 不使用；其舊 APK hash／草稿 ID
  不適合此流程。新增 Secrets 不會自動改變舊腳本或啟動工作。

## 本機驗證（2026-10-27）

- 10 項新增流程測試通過；完整 Vitest 103 files／978 tests，typecheck、
  targeted Biome、bash syntax 和 diff checks 通過。
- 官方 actionlint 1.7.7 發行檔經上游 checksum 核對，驗證新 workflow 通過
  （本機未安裝 shellcheck，未宣稱執行該額外分析）。Go 安裝工具的嘗試失敗，
  改用該已校驗官方二進位；不是略過 workflow lint。
- 從 runtime source `233fc88c` 的暫存 git archive 加入相同 submodule 快照，
  執行新的 `npm ci` 和建置腳本；Gradle 29 秒、62/62 tasks executed。
  package.json／package-lock.json／config.xml 的前後 hash 全部相同。
  這是一次全新平台／node_modules 的本機快照測試，沒有新增 git worktree。
- 直接執行 workflow 的還原／簽章／驗證／metadata／cleanup shell：先將上述
  APK 改簽為一次性 dummy key，再改回既有測試 signer；實際 apksigner、
  zipalign、aapt 和指紋檢查全部通過。測試輸出僅在本機保留，沒有上傳；
  暫存 key 副本已刪除，原始測試 keystore 未改動。
- 草稿上傳的實際 shell 使用 dummy 檔案與 mock `gh` 驗證參數；缺少 token、
  APK 被修改、缺少／錯誤簽章時的拒絕測試通過。沒有對 GitHub 建立草稿、
  發布 Release、傳送簽章 key 或執行新的手動 APK workflow，因此不宣稱該遠端
  建置／簽章／上傳流程已成功。
- 提交後另外核對安全分支 source `cc332b2c` 的
  [既有遠端 CI](https://github.com/rs-assistant/Acode/actions/runs/40474350880)：
  GitHub API 回報 native regressions、unit tests、formatting、spelling 全部成功，
  translation 按事件條件略過。啟用 PR #1 的五個 checks 也全部成功，仍待審查／合併。
  雲端 proxy 拒絕下載 Actions log 的網域，因此此處的遠端結論只引用 API job
  狀態；上列詳細測試數量來自本機輸出，不是聲稱已重新讀取遠端 log。
  既有 CI 成功也不等於新手動 APK workflow 或實機驗證成功。

Production gate 仍見 [SSH_PRODUCTION_RELEASE_BLOCKED.md](SSH_PRODUCTION_RELEASE_BLOCKED.md)。
