# Production SSH credential release gate — BLOCKED

This branch is **not approved for production SSH credentials**.

## Blocking findings

1. The native Cordova Sftp bridge exposes saved-profile authentication, remote shell, command execution, and file transfer operations without an independently authenticated caller identity.
2. The actual loader was traced: third-party plugins execute in the main WebView with Cordova access. The accepted [SSH-safe edition](ssh-safe-mode.md) now blocks their execution before script loading, including themes and cached developer tools. Device/upgrade enforcement is not yet validated.
3. An application-level JavaScript token cannot establish a trustworthy native caller identity if plugins share the same realm.
4. Negative adversarial plugin tests, merged Android manifest validation, and APK/device tests are outstanding.

## Unblock only after

- [x] Trace the actual Plugin Loader implementation and identify its JS realm and Cordova API exposure.
- [x] Implement the user-approved alternative: immutable native safe-edition policy and fail-closed blocking of all third-party plugin execution, with JS/native regressions. This is not shared-realm native caller authentication.
- [ ] Verify remote exec, upload, download, and shell paths against a malicious test plugin.
- [ ] Confirm built APK backup/data extraction and network policies.
- [ ] Run dependency scans, CI tests, and Android emulator/device tests.
- [ ] Review the patch and document residual risks.

Do not interpret a passing source-text test as a security proof.
