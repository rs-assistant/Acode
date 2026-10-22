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
