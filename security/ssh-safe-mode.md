# SSH-safe edition

The user explicitly accepted disabling **all third-party Acode plugins**, including
plugin themes, while using saved-credential SSH/SFTP. This branch now implements
that alternative to shared-realm caller authentication. Built-in Cordova plugins,
editor features, SSH/SFTP and terminal code remain bundled and enabled.

## Enforcement

- `Tee.getSecurityPolicy` returns a read-only, native build policy. There is no
  setter, setting, localStorage flag or live switch. This edition is always safe
  mode; re-enabling plugins requires a different reviewed build and a fresh app
  process/WebView. Reloading alone does not enable them.
- Startup theme and ordinary-plugin passes return without scanning/executing
  plugins. Direct script loads, timeout/retry loads, installations and detail
  pages are independently guarded before their side effects.
- The plugin manager shows a localized notice instead of marketplace/install
  controls. Existing installations, secrets and enabled/disabled settings are
  preserved, not deleted or marked broken merely because of the policy.
- Missing, malformed, conflicting, failed or timed-out native policy fails closed.
  The result is cached for the WebView lifetime, including failures.
- Downloaded/cached Eruda developer tools also execute in the privileged WebView
  and are blocked before any filesystem or script-loading effects.

## What this does not claim

There is still no independently authenticated plugin caller in the shared realm.
The historical privilege-delegation tests deliberately bypass the loader to show
why executing untrusted code there remains unsafe. An XSS or a user pasting
untrusted code into the privileged console is not isolated by this policy.
Do not expose that console or native debugger to untrusted code.

Native Java harness and real-source JS tests cover policy/loader behavior, not
Android Keystore, real Cordova scheduling, app-upgrade lifecycle or networking.
The [production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains BLOCKED
until device checks are completed with dummy credentials.

## Device acceptance checklist

1. Back up editor files/settings. Install the new test edition only when its
   source/hash/signature and upgrade compatibility are documented; do not
   uninstall an existing app as a workaround for a signature mismatch.
2. Force-stop/relaunch with previously installed normal and theme test plugins.
   Neither plugin's harmless execution marker may appear. Repeat after reload,
   activity recreation and app restart. Built-in theme/editor must remain usable.
3. Open plugin manager, direct plugin links and ZIP installation intents; confirm
   the notice, no downloads/purchases, and no script execution/settings damage.
4. With dummy profiles on a dedicated SSH host, test saved-profile connect,
   host-key unknown/changed decisions, two hosts, shell/exec, upload/download,
   disconnect/reconnect and WebView reset. Confirm no secret-bearing logs.
5. Confirm cached Eruda cannot run even when developer mode was previously set.
6. Repeat the loader tests using an instrumented native-policy failure/timeout;
   plugin execution must stay blocked and the UI must remain responsive.

The older public tablet APK is unchanged and does **not** contain this policy.

## New tablet test artifact (2026-10-22)

With the user's approval, a separate artifact-only branch now provides the
[SSH-safe tablet test APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-apk-20261022/acode-ssh-safe-e1b32fc7-debug.apk).
See the [installation/test instructions](https://github.com/rs-assistant/Acode/blob/8cf12bf67e0f0a37984cb2006c1a869f7549a9f1/README.md)
and [publication record](ssh-safe-tablet-publication.json). Its exact source is
`e1b32fc7e72dd0a36cea1454338f4be3fbbfa38c`, not later documentation-only commits.
The public download was fetched without GitHub authentication, compared byte for
byte against the built APK, and its signature verified. This does not complete
the Android runtime/upgrade checklist or approve production SSH credentials.
