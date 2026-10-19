# Plugin Loader / SSH trust-boundary verification

Status: source and runtime verification required. This document does **not** assert plugin isolation.

## Evidence

- Acode plugin contract loads JavaScript entry scripts and exposes the global `acode` API.
- Native `Sftp.execute()` exposes profile-based connect, shell, command and file operations via Cordova, without caller identity checks.
- `Tee.requestToken` accepts permissions from supplied plugin JSON; a plugin ID is not a cryptographic identity.
- A separate `WebViewInstance` exists for auxiliary web content, but does not establish isolation for all installed plugins.

## Verification checklist

1. Locate the actual installed-plugin script loader and determine whether it injects script tags, evaluates code, uses iframes, or creates separate WebViews.
2. Test whether an installed test plugin can access `window.cordova` and invoke `cordova.exec` for `Sftp`.
3. Test whether a plugin can reach `window.sftp`, `acode.require` internals, or invoke an existing SFTP connection's `exec`, `getFile`, or `putFile`.
4. Repeat tests after plugin reload, WebView navigation, app restart, and switching SSH profiles.
5. Use only dummy credentials and a dedicated test SSH server; record logs without secrets.

## Acceptance criterion

No untrusted plugin can cause a saved-profile SSH authentication, reuse a session, run commands, or transfer files. A JS token or claimed plugin ID is **not** acceptable evidence of isolation in a shared JS realm.

## Design alternatives

- Preferred: a privileged native service with a separately authenticated, non-JavaScript-callable control plane and no credential/session handles exposed to plugin JS.
- Safe interim mode: disable untrusted plugins while saved-profile SSH access is enabled, **provided this is enforced before loading plugin code**.
- Not acceptable: a JS-only permission check, secret token stored in shared JS, or UI-only biometric prompt.

## Release gate

Block production-key use until negative plugin tests and APK-level validation pass.
