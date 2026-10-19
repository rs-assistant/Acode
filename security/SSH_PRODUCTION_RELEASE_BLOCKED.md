# Production SSH credential release gate — BLOCKED

This branch is **not approved for production SSH credentials**.

## Blocking findings

1. The native Cordova Sftp bridge exposes saved-profile authentication, remote shell, command execution, and file transfer operations without an independently authenticated caller identity.
2. Third-party Acode plugins run JavaScript inside Acode. The precise loader execution realm and access to Cordova globals have not yet been verified from the fork's loader implementation.
3. An application-level JavaScript token cannot establish a trustworthy native caller identity if plugins share the same realm.
4. Negative adversarial plugin tests, merged Android manifest validation, and APK/device tests are outstanding.

## Unblock only after

- [ ] Trace the actual Plugin Loader implementation and identify its JS realm and Cordova API exposure.
- [ ] Implement a native boundary that prevents third-party plugins from authenticating with saved SSH profiles or reusing sessions.
- [ ] Verify remote exec, upload, download, and shell paths against a malicious test plugin.
- [ ] Confirm built APK backup/data extraction and network policies.
- [ ] Run dependency scans, CI tests, and Android emulator/device tests.
- [ ] Review the patch and document residual risks.

Do not interpret a passing source-text test as a security proof.
