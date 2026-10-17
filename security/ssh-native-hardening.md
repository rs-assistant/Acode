# SSH native hardening: trust boundary and implementation plan

Status: design baseline; **not a security fix**. Do not use production SSH credentials until enforcement and tests land.

## Observed architecture (main @ ef7f326)

- Third-party plugins are JavaScript entry scripts loaded by the Acode plugin lifecycle. The public plugin API exposes editor and file operations.
- The native Cordova Sftp service exposes `connectUsingProfile`, `openShellUsingProfile`, `exec`, `getFile`, `putFile`, and other operations via `execute(action, args, callback)`.
- `isAllowedAction` only restricts action names, not caller identity.
- `SftpSecurityStore` encrypts profiles with `EncryptedPreferenceManager(..., false)`; this protects data at rest, not use of credentials by arbitrary JavaScript.
- `Tee.establishConnection` returns a session secret to its caller, and `requestToken` derives permission claims from caller-supplied plugin JSON. This is not an independently authenticated native plugin identity.
- An auxiliary WebView uses a message bridge; its existence does not prove third-party plugin isolation from the main Cordova JavaScript environment.

## Security invariant

Untrusted plugin JavaScript must not be able to (a) retrieve credentials, (b) connect using a saved profile, (c) reuse an authenticated SSH/SFTP session, or (d) execute commands / transfer files via the privileged native bridge.

## Required loader verification before native code changes

1. Identify the actual plugin entry-script injection mechanism and JS realm (main WebView vs iframe/isolated WebView).
2. Enumerate reachable Cordova globals and Acode modules from plugin code.
3. Trace SFTP UI callers and all native entry points, including existing sessions.
4. Build a malicious **test-only** plugin proving whether `cordova.exec` is reachable; never run it against production credentials.

## Architecture decision

**Do not use a JavaScript-supplied token, plugin ID, or manifest permissions as native proof of caller identity.** In a shared JS realm, a plugin can impersonate a trusted caller.

Preferred: move privileged SSH credentials and session operations behind a trusted native interaction surface that untrusted plugin JS cannot invoke, with an enforceable process/realm boundary and authenticated IPC. If this is impractical, disable third-party plugins whenever saved-credential SSH functionality is enabled; a cosmetic permission prompt is not sufficient.

BiometricPrompt can be defense in depth but cannot establish JavaScript caller identity.

## Acceptance tests

- A test plugin cannot invoke saved-profile connection, open shell, exec, upload, download, or reuse session handles.
- Built-in file browser and terminal still work across multiple SSH hosts.
- Unknown host keys require out-of-band fingerprint confirmation; changed keys fail closed.
- Corrupted or unavailable encrypted storage fails closed.
- Credential material is not exposed to JS callbacks, logs, backups, or plaintext preferences.
- Network policy and release manifest are validated from the built APK.
- Security tests run in CI and an Android device/emulator; document residual risks.

## Release gate

No production key import until isolation is demonstrated by code and negative tests, dependencies are scanned, and the release APK is signed and verified.
