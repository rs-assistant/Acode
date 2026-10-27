# Production SSH credential release gate — BLOCKED

This branch is **not approved for production SSH credentials**.

## Blocking findings

1. The native Cordova Sftp bridge exposes saved-profile authentication, remote shell, command execution, and file transfer operations without an independently authenticated caller identity.
2. The actual loader was traced: third-party plugins execute in the main WebView with Cordova access. The accepted [SSH-safe edition](ssh-safe-mode.md) now blocks their execution before script loading, including themes and cached developer tools. Device/upgrade enforcement is not yet validated.
3. An application-level JavaScript token cannot establish a trustworthy native caller identity if plugins share the same realm.
4. Native/JS regressions and packaged manifest/extraction inspection passed locally; Android adversarial/upgrade tests are still outstanding. A stub harness is not the real Cordova runtime.
5. [Current npm and selected Maven scans](native-and-vendored-audit.md) report zero npm findings and zero affected modules in the 87-coordinate GitHub-reviewed Maven query after fixes. OSV/NVD cross-checks, complete embedded-library inventory and tablet compatibility remain unverified; no comprehensive dependency-security approval is claimed.
6. [Local service review](local-network-boundaries.md) fixes the unauthenticated process stream and adds preview path/main-navigation guards. Preview LAN authorization/binding, concurrency and broader guest-browser/symlink checks remain open; real-loopback JVM tests are not Android lifecycle acceptance.

## Unblock only after

- [x] Trace the actual Plugin Loader implementation and identify its JS realm and Cordova API exposure.
- [x] Implement the user-approved alternative: immutable native safe-edition policy and fail-closed blocking of all third-party plugin execution, with JS/native regressions. This is not shared-realm native caller authentication.
- [ ] Verify remote exec, upload, download, and shell paths against a malicious test plugin.
- [ ] Verify new on-device key generation, real Keystore persistence, public-key copy,
      saved-identity SFTP/shell login, deletion/restart and old-profile compatibility
      on Android; actual-library JVM crypto tests do not close this requirement.
- [x] Inspect built APK backup/data extraction and network flags. Cleartext remains enabled for existing localhost preview/terminal compatibility; a network-policy redesign is not claimed.
- [x] Rerun local npm full/omit-dev scans and document current zero results and scope.
- [x] Inventory selected Android runtime Maven components, query reviewed GitHub advisories with controls, and validate native crypto/embedded-cookie fixes locally.
- [ ] Cross-check additional advisory sources and complete the broader embedded/binary dependency inventory.
- [ ] Run remote CI and outstanding Android emulator/device security tests.
- [ ] Review the patch and document residual risks.

Basic key-generation/login testing has positive [user feedback](tablet-test-feedback.md).
This does not complete the more specific failure/deletion/adversarial checklist.
The follow-up [storage-failure hardening](storage-failure-hardening.md) has its own
local regressions and still requires device acceptance.

Do not interpret a passing source-text test as a security proof.
