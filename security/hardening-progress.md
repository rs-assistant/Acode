# SSH hardening progress

The original tablet APK and its source snapshot are preserved. This document
tracks subsequent fixes on `security/ssh-native-hardening`. The historical
[tablet audit](tablet-ssh-audit.md) describes the older APK, not the status of
every fix on this branch. Production SSH approval remains **BLOCKED** until the
remaining shared-realm/caller-isolation problems and device checks are resolved.

## Stage 1: integrate the existing fixes and tablet source

- Preserve all 17 existing remote security commits and merge the tablet source
  and audit branch. Keep the original source and artifact branches unchanged.
- Resolve token reset so it clears plugin tokens, permissions, and SFTP
  capabilities together. Keep manifest validation before token issuance,
  fail-closed plugin storage, and private-key buffer clearing from the remote.
- Retain both sets of source regression checks. Correct the overescaped storage
  constructor matcher without removing the deliberately failing release check.
- Convert the reset/fallback native characterizations into rejection/fail-closed
  regressions. Namespace isolation is still outstanding at this stage.
- Reinstall the changed local Cordova plugins and build with the wrapper:
  `BUILD SUCCESSFUL`, 62 tasks, 15 executed and 47 up-to-date; APK signature check
  passed. Packaged backup and data-extraction settings were also inspected.
- Targeted Vitest: 18 passed, 1 intentionally failing native-isolation release
  check. Java harness: 1 control, 2 fixed-defect regressions, 1 outstanding
  namespace characterization. These do not establish Android runtime security.

## Original tablet artifact

The public download branch still serves SHA-256
`d4bb10db18b664cd74b10ecfa723e4c8f43687cea41af92fe8f8cf06fece4bfb`.
New local build outputs are not replacements for that APK. Do not publish a new
test binary without a new source/validation record and clear test instructions.

## Stage 2: plugin secret namespace and lifecycle

- Reject app-owned and invalid identifiers before issuing a plugin token.
- Derive an independent, filename-safe encrypted store name from the plugin ID;
  all four operations share a strict accessor. No arbitrary legacy-store reads.
- Serialize action dispatch with reset, and revoke on destruction as well.
- Java harness: 30 native regression assertions passed. Unlike the historical
  characterization, these assertions now require rejection/revocation.
- Existing JS privilege-delegation characterizations still reproduce the
  unresolved shared-realm defects; the isolation release check remains red.
- Plugin secret storage has a compatibility cutover; see
  [plugin-secret-storage.md](plugin-secret-storage.md) before installing a new APK.

## Stage 3: user-approved SSH-safe edition

- Add an immutable native read-only policy; no runtime setter or settings toggle.
  Block all third-party plugins and plugin themes before any script execution,
  including direct/retry/installation entry points. Preserve installed plugins
  and settings, and show English/Traditional Chinese notices in plugin UI.
- Also block downloaded/cached Eruda scripts in the privileged WebView. Native
  policy failures, malformed values and timeouts fail closed for plugin loading.
- Replace the obsolete deliberately-red shared-realm authentication placeholder
  with checks for the accepted no-plugin architecture and 15 real-source policy,
  loader, installer and UI tests. Do not imply native caller identity exists.
  **Production release remains BLOCKED** by the explicit device checklist.
- Full Vitest: 94 files, 840 tests passed. Native harness: 34 assertions passed.
  Typecheck, targeted Biome and diff checks passed. Android build/signature passed:
  62 tasks, 6 executed and 56 up-to-date, 13 seconds.
- See [safe-mode design and device acceptance](ssh-safe-mode.md). No new APK was
  published and the existing tablet download remains unchanged.

## Stage 4: backup domains, safe errors and native CI

- Exclude all nine supported app data domains in both cloud-backup and
  device-transfer rules; retain `allowBackup=false`. Verify all 18 exclusions in
  the APK with aapt2, rather than checking source XML alone.
- Replace raw SSH/SFTP exception text, shell errors and exception-bearing log
  calls with fixed categories/static logs. Preserve host-key verification data.
- Add 11 native dummy-secret error assertions and a pinned-action JDK 21 CI job.
  Local harness: 34 Tee + 11 error assertions passed. Targeted security JS tests:
  3 files, 32 passed. Android build/signature passed: 62 tasks, 12 executed and
  50 up-to-date, 16 seconds. See [details](backup-and-errors.md).
- Packaged manifest was inspected: backup false, extraction resource present.
  Cleartext remains true for existing localhost terminal/preview compatibility;
  no broad cleartext-policy redesign or real-device validation is claimed.
- The workflow is committed, but remote CI execution is not verified. No emulator
  or tablet is connected to this environment; production release stays blocked.

## Stage 5: preview and toolchain dependency updates

- Update bundled DOMPurify, markdown-it and Mermaid within their major versions,
  plus allowed-range vulnerable npm build-tool leaves. Keep Cordova 13 and avoid
  forced major changes/overrides. Add jsdom-only preview regression coverage.
- Fresh lockfile installation succeeded. Final full Vitest: 95 files, 844 tests
  passed; typecheck, Biome/diff checks and 34 + 11 native assertions passed.
  Fix the folding test's incomplete parsing mock after reproducing full-run
  failures and an isolated pass; no production folding behavior was changed.
- Android Debug build/signature passed after the dependency updates (16 seconds,
  62 tasks up-to-date after an earlier successful 18-second bundle build).
- Audit findings are reduced but not cleared: omit-dev 11 affected nodes,
  full/development scan 30. See [audit and remaining risks](dependency-audit.md).
  A targeted Gradle check resolved commons-io to 2.20.0, not the plugin's older
  declaration. No comprehensive Java vulnerability scan is claimed.
- Main, tablet artifact and original tablet source branches remain unchanged.
  No real Android device/emulator or successful real-browser test was available.

## Stage 6: separately approved tablet test publication

- The user approved a new, separate download branch while retaining the original
  APK and link. Publish only APK, README, SHA256SUMS and PROVENANCE.json on
  `test/ssh-safe-apk-20261022`, artifact commit
  `8cf12bf67e0f0a37984cb2006c1a869f7549a9f1`; exact runtime source is `e1b32fc7`.
- Fresh local validation: 95 Vitest files / 844 tests, typecheck and 34 + 11 native
  assertions passed. Rebuild and APK signature verification passed. The five
  recorded Java sources match their generated Android copies; packaged main.js
  matches the bundled output. This is not independent DEX/runtime verification.
- Final packaging inspection found the existing hook defaults to target SDK 28
  without its variant flag. That initial output was NOT published. Explicitly
  provide a task-local `fdroid.bool=false` and rebuild the paid Debug variant:
  packaged min/target/compile SDK are 26/36/36, matching the original target 36.
  Final build: 11 seconds, 62 tasks, 5 executed and 57 up-to-date.
- Package/versionCode/signing certificate match the earlier Debug APK. Actual
  Android upgrade behavior remains untested; instructions warn against uninstalling
  on a signature conflict. Published artifact is 45,842,546 bytes, SHA-256
  `f2ce0277a237afcefb27bcbc92a676a5e6ffb84f7a15adbdaf19657c4bfae0b5`.
- Anonymous public download returned HTTP 200; all bytes, SHA-256 and signature
  were rechecked after downloading. Old artifact/source branches and main were
  confirmed unchanged. See [publication record](ssh-safe-tablet-publication.json).
- Production release remains BLOCKED. Only dummy-credential tablet testing is
  requested; dependency findings, device/upgrade and adversarial tests remain open.

## Stage 7: tablet-reported invisible security-dialog actions

- User reports safe-mode notice, ordinary editing and a connection working, but
  host-key dialog buttons invisible; private-key instructions were requested.
  Record these narrowly, not as completion of transfer/terminal/adversarial tests.
- Trace the white global accent inherited by native framework alerts. Use an
  explicit native Material light/dark alert theme for unknown-host, changed-key
  and saved-profile-deletion dialogs; trust/cancel/host-key comparison is unchanged.
- Local tests: 95 files / 845 JS tests, typecheck, 34 + 11 + 6 native assertions
  passed. Theme-selector tests do not render UI. Android native rebuild/signature
  passed, then rebuild from clean committed source `ffb1bfd1` passed again.
- Publish a separate dialog-fix APK, with source/signature/provenance records;
  anonymous HTTP 200 download matches all built bytes and verifies with apksigner.
  Both earlier APK download branches remain unchanged. See
  [feedback, key-auth instructions and artifact](tablet-dialog-and-key-auth.md).
- Await actual tablet rendering and test-key login results; no production SSH
  release approval or new real-device success is claimed.

## Stage 8: user-requested on-device SSH identity generation

- Review Android SSHBorg at commit `1388c99d` as a workflow reference; independently
  implement the feature with the existing Maverick/BC stack, without copying GPL
  source or allowing optional/plaintext credential storage.
- File Browser + → SSH keys generates native Ed25519/RSA-4096, displays/copies
  only public metadata, and lets SFTP/SSH profiles select an opaque saved identity
  ID. Strict native encrypted vault, synchronous commits, 32-key cap, and no
  private-key export. Existing password/file-key authentication is retained.
- Native-confirmed local deletion does not revoke server authorization, in-flight
  handshakes or established sessions. Loss/recovery, backup and server public-key
  installation instructions are explicit; no automatic remote writes are made.
- Final full JS suite: 97 files / 866 tests passed; typecheck, targeted Biome and
  diff checks passed. One existing JSDoc folding test failed under a concurrent
  Android build; the final uncontended full suite passed without changing it.
- Native core: 35 + 11 + 6 assertions passed. Real-library crypto/vault harness:
  55 assertions passed, including both algorithms' sign/verify and OpenSSH public
  parsing/fingerprint checks. Android storage remains an adapter in those tests.
- Clean committed source `96a37beb` builds/signs successfully, min/target/compile
  26/36/36. All eight recorded native sources match generated copies; packaged
  main.js matches the build output. This is not independent runtime/DEX proof.
- Separate artifact branch `test/ssh-safe-keygen-20261022` at `360e9b38`; anonymous
  HTTP 200 download, byte/hash match and signature verified. Prior three APK
  branches and main are unchanged. See [design and download](ssh-key-generation.md).
- Real tablet generation, key-authenticated SFTP/shell, Keystore, delete/restart
  and old-profile regression checks remain pending; production release is BLOCKED.

## Stage 9: tablet feedback, durable-write failures and build defaults

- Record subsequent user-reported basic functional success separately in
  [tablet feedback](tablet-test-feedback.md); do not treat it as completion of
  Keystore, deletion/failure or adversarial plugin checks.
- Fix strict preference writes so a failed commit cannot leave usable unconfirmed
  cached SSH state. Namespace-shared locking/failure latches apply across manager
  instances; recovery requires process restart and inspection, not a JS reload.
  Profile deletion now checks persistence and reports failures from the dialog.
- Replace the missing-flavour flag's silent target-28 fallback with Cordova's
  configured SDK; preserve the explicit legacy F-Droid override and reject invalid
  flags. Four new tests reproduce the old behavior and validate the fix.
- Fresh full Vitest: 97 files / 888 tests passed. Typecheck, targeted Biome and
  diff checks passed. Native core: 52 assertions; production preference/SFTP-store
  harness: 79; crypto/vault: 55 + 30. Android/AndroidX remain explicit adapters.
- Native Android rebuild/signature passed (20 seconds, 62 tasks: 13 executed,
  49 up-to-date), deliberately with no fdroid.bool. Packaged min/target/compile
  SDK 26/36/36, backup false and all 18 data-extraction exclusions verified;
  cleartext remains true for the existing localhost workflows.
- Rerun npm audit: omit-dev 11 nodes (9 high / 2 low), full 30 nodes (22 high /
  5 moderate / 3 low), both exit 1. No dependencies/lockfile changed this stage.
- GitHub API returned no registered workflows or branch runs; no remote CI
  success claimed and no account/repository Actions permissions were changed.
- See [failure model, recovery and validation](storage-failure-hardening.md).
  Production release remains BLOCKED.
- Clean committed runtime source `8be13af6` rebuilt/signed (11 seconds, all 62
  tasks up-to-date after the actual native rebuild). Eight native sources match
  generated Android copies; packaged main.js matches the bundle. No variant flag
  was supplied, and final APK metadata still reports target 36.
- Published the separate artifact-only `test/ssh-safe-storage-20261022` at
  `178b2737`, preserving all four earlier artifact branches, original source
  snapshot and main. Anonymous public download returned HTTP 200, all bytes/hash
  matched and the downloaded signature verified. See [publication record](ssh-storage-apk-publication.json).
- This source's device upgrade/failure/deletion/adversarial acceptance is still
  pending. Positive earlier key-generation feedback is not reassigned to this APK.

## Stage 10: runtime migration and embedded HTTP library

- October 27 baseline was 2 omit-dev / 20 full nodes before edits; advisory changes
  since the older 11/30 scan are not all credited to this patch.
- Migrate KaTeX to reviewed 0.18.10 and Mermaid to 12.2.0, aligning KaTeX copies
  with explicit preview trust=false. Avoid deprecated, mistakenly released 0.18.11.
- Replace embedded HTTP-plugin Lodash 4.17.1 with upstream 4.18.1 and license
  asset. Reproduce/fix prototype write/deletion regressions in isolated VMs and
  retain cookie path/adapter checks. npm alone missed this vendored copy.
- Update patched test/tool leaves; remove stale upstream-only vendored-plugin
  development dependencies/scripts pointing at absent tests, not product tests.
  Keep the CodeMirror submodule and Cordova version unchanged.
- Fresh lockfile installation, 98 files / 901 JS tests, typecheck and 216 native
  assertions pass. Android build/signature: 13 seconds, 9/62 tasks executed.
- Scans: omit-dev 0 (exit 0); full 4 (1 high / 3 moderate, exit 1) in the unresolved
  buildhelper/testtool/Mocha/serialize chain. Discard ineffective trial overrides
  instead of claiming the actual resolved Mocha changed. Browser attempt timed out.
- Details: [October 27 follow-up](dependency-audit-2026-10-27.md). Previous APK
  downloads and main are preserved; no replacement APK published at this stage.
  Production credential approval remains BLOCKED; tablet visuals are pending.
- Clean runtime source `0c37fdf0` rebuilt/signed in 10 seconds (62 up-to-date),
  retaining the inspected APK hash; updated bundled Lodash, license and main.js
  verified in the package. Source is published on the security branch, not main.

## Stage 11: close the remaining development-tool chain

- Keep the CodeMirror submodule clean/pinned. Explicitly declare root development
  buildhelper 1.0.2 and scope a Mocha 12 override to its testtool; the real linked
  client now resolves Mocha 12.0.3 and serialize-javascript 7.1.4. No source fork,
  ignored node_modules edits or unrelated direct Mocha install.
- Normal fresh npm ci (including lifecycle hooks), actual client prepare,
  typecheck, Biome and diff checks pass. New real-runner/ESM/CommonJS/parallel-worker
  coverage checks both positive counts and an expected failure. Full Vitest:
  99 files / 906 tests passed.
- Both fresh full and omit-dev npm audits return 0 findings and exit 0. These
  close the earlier four nodes, not every embedded/Maven/device security issue.
  See [migration and limits](codemirror-toolchain-migration.md).
- Android rebundle/build/signature passed in 10 seconds (62 up-to-date); SDK
  26/36/36 and certificate match. The resulting APK is byte-identical to the
  previously archived local dependency-update build; this migration is dev-only.
- Main and existing tablet downloads remain untouched; no new APK published.
  Production SSH approval remains BLOCKED pending the broader acceptance work.

## Stage 12: non-device native and embedded-cookie review

- Inventory 87 selected Android runtime Maven coordinates with a read-only Gradle
  init task, then query paginated reviewed GitHub advisories with positive/negative
  version-filter controls. OSV is blocked by the environment proxy; do not claim
  all-source CVE coverage. Parse/API errors fail instead of producing a clean scan.
- Find BC 1.83 package/range matches and migrate the official provider/pkix/util
  set to 1.86. The 1.85 trial passed JVM tests but failed Android's duplicate-class
  check; retain a new base-class overlap guard, not edited crypto JARs. Final
  1.86 graph has zero affected modules in this 87-coordinate provider query.
- Replace embedded tough-cookie 3.0.0 with reproducibly bundled 4.1.4, complete
  notices and a compatible browser/custom-store adapter. Reproduce the old memory
  store's prototype mutation in a VM; test the real new bundle/handler behavior.
  Add CI rebuild comparison (local only verified), pin already-selected NanoHTTPD
  and Commons IO versions, preserve SSH strict credential storage unchanged.
- Full JS: 101 files / 931 tests; typecheck and 216 native assertions pass. npm
  scans both zero. Final Android build/signature and packaged source/license,
  SDK, backup/extraction checks pass; no device testing or new public APK.
- See [findings, failures, controls and remaining limits](native-and-vendored-audit.md).
  Main/previous artifacts and CodeMirror submodule are preserved; production gate
  stays BLOCKED. Remote CI, additional advisory coverage and device work are open.
- Clean committed runtime source `1bb96cb1` rebuilt/signed in 10 seconds (62
  up-to-date), preserving the inspected APK hash. A fresh clean-source 87-module
  query again returned zero; its source/timestamp/provider/controls are retained
  in [the machine-readable report](android-runtime-advisories-2026-10-27.json).

## Stage 13: authenticated process sockets and preview/main-navigation guards

- Reproduce the original tokenless process stream using its production source,
  real Java-WebSocket and disposable cat on loopback. Require a fresh 256-bit
  capability before upgrade/process creation, one owner, bounded startup/unused
  expiry, native registry limits and reset/destroy/stopService revocation.
- Keep the public JS spawnStream callback, reject legacy numeric descriptors,
  remove raw command exception details, and handle binary buffer slices safely.
  The exact native server passes 35 real-loopback assertions; Android lifecycle
  wiring remains source/compile validation, not real Cordova instrumentation.
- Reject preview traversal/ambiguous request paths before URI/filesystem work.
  Remove unnecessary broad main-editor http(s) navigation entries, while retaining
  external browser intents/network requests. Do not misreport the existing Cordova
  launch-origin bridge policy as an arbitrary-origin bridge bypass.
- Full suite 102 files / 967 tests and typecheck pass; prior 216 native assertions
  pass as well. Android build/signature: 16 seconds, 16/62 tasks executed. Native
  installed sources, packaged wrapper, SDK/config/backup settings inspected.
- LAN preview binding initially awaited the user's functional preference; the
  following stage restricts it. Native preview authorization/concurrency, symlinks
  and guest-browser policy remain open.
  See [review and limits](local-network-boundaries.md). No device work or public
  APK replacement; main and old downloads remain preserved. Production stays blocked.

## Stage 14: user-selected loopback-only preview

- User declined cross-device Wi-Fi preview. Restrict the production NanoHTTPD
  constructor to `127.0.0.1`, without a configurable wildcard fallback. Retain
  existing localhost preview URLs and custom external preview destinations.
- New real NanoHTTPD socket harness passes 13 assertions, including local HTTP
  and connection refusal on both active non-loopback IPv4 interfaces. Android/
  Cordova adapters are explicit and request handling returns dummy text; native
  file/bridge behavior and real tablet Wi-Fi are not tested by it. Wire it into CI.
- Full JS: 102 files / 968 tests; typecheck and targeted checks pass. Reinstall
  the local server plugin, verify generated Java matches source, and rebuild/sign
  Android: 16 seconds, 7/62 tasks executed, SDK 26/36/36, prior Debug signer.
- No public APK replacement, main update or device testing. Same-device client
  authorization and native preview response-map/concurrency/lifecycle remain open.
  See [current findings and artifact hash](local-network-boundaries.md).
