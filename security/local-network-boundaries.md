# Local network and main-WebView hardening — 2026-10-27

## Process stream: reproduced and fixed

The old production ProcessServer bound only 127.0.0.1, but unconditionally started
its supplied command on WebSocket open. Compiling that original source unchanged
with the real Java-WebSocket library reproduced a tokenless connection carrying
an untrusted Origin header and echoing dummy `/bin/cat` input on a dedicated
loopback socket. No real command shell, SSH account, project data or credentials
were used. This is a real local transport defect, not proof that every Android
browser allows private-network/mixed-content WebSocket requests.

The new server:

- Uses a fresh SecureRandom 256-bit capability per instance and requires an exact
  resource path at the HTTP upgrade, before creating a process. It remains bound
  to IPv4 loopback; port 0 is bound directly and the actual bound port is returned,
  eliminating the separate free-port probe/rebind window.
- Admits one owner/process; duplicate or rejected clients cannot kill the owner
  or reserve a new process. Only the owner can write stdin. Binary writes support
  direct/sliced/read-only buffers, and outgoing buffers are not reused while an
  asynchronous send might still reference them.
- Bounds startup waiting to 5 seconds; unused listeners expire after 30 seconds.
  The native plugin caps pending/active stream servers at 32 and revokes them on
  reset, destruction and explicit stopService. Epoch checking rejects queued work
  from an old WebView lifetime. Cleanup stops sockets off the WS worker thread.
- Destroys its direct owned process and closes streams. This is NOT a process
  sandbox or a promise to terminate every arbitrarily forked descendant.
- Returns `{port, token}` to the bundled spawnStream wrapper. Its public callback
  still gets a raw WebSocket, but the native descriptor is intentionally NOT
  backward compatible with old numeric-only results. The JS wrapper rejects old
  or malformed descriptors rather than falling back to an unauthenticated URL.
- Does not put command arguments/library error text into close reasons. Wrapper
  connection errors do not forward the event containing a capability URL.

The capability is a bearer secret in the WS URL: do not log, persist or share it.
Its necessary presence in the trusted main WebView is not independently
authenticated native caller identity. Executing hostile code in that same realm
remains unsafe; the accepted no-third-party-plugin policy is still required.

The real-loopback harness passes 35 assertions. Registry/epoch wiring also has
source regression checks and Android compilation, but Android/Cordova scheduling
and lifecycle enforcement are not established by those source checks.

## Preview path normalization

The preview request handler previously passed a network-derived path into the
general URI join utility, which intentionally resolves `..` outside the supplied
directory. A separate request-path guard now runs before extension parsing,
editor lookups or filesystem operations. It refuses parent/current-directory
segments, encoded variants/separators, controls, scheme/query/fragment ambiguity,
malformed encoding and excessive nesting. Normal index/HTML/CSS/media paths and
Unicode names remain covered. Relative paths outside the preview root and
ambiguous structural/percent-containing filenames are not enabled by this fix.

Tests execute the real handler's guard prefix to verify rejection returns before
the file phase, as well as the actual join normalizer. They are NOT full native
HTTP end-to-end or filesystem permission/symlink tests. This guard is not a
canonical-filesystem symlink jail. The known busy-wait/response-map/concurrency
behavior in the native preview server still needs a separate review/fix.

## Main navigation is not guest navigation

Remove blanket http(s) allow-navigation entries from the main editor WebView.
Cordova's bundled launch-origin navigation remains the default; external browser
intents and general network requests remain configured. Existing separate native
browser/guest WebViews do not use this editor navigation allowlist.

Framework inspection matters: this Cordova version's default bridge access policy
already checks the launch-origin prefix independently of these navigation
entries. Therefore the old wildcard navigation setting is NOT reported as a
demonstrated arbitrary-website-to-native-bridge bypass. The change reduces
unnecessary main-editor navigation exposure; it does not prove every iframe,
guest browser, content-provider or XSS path is isolated.

## Validation of the initial stream/path changes (`ff7cd410`)

- Full Vitest: 102 files / 967 tests passed; typecheck, targeted Biome, shell
  syntax, diff checks and CI YAML parsing passed. This includes the actual URI
  normalizer characterization and the 36-test boundary suite. Both fresh npm
  full and omit-dev advisory scans also returned zero findings / exit 0.
- Real-loopback server harness: 35 assertions. Existing native policy/error/theme,
  preference-failure and crypto harnesses: 216 assertions, with their documented
  Android adapter limits. No device/emulator was attached or tested.
- Android native rebuild, DEX/package and signature passed: 16 seconds, 62 tasks
  (16 executed, 46 up-to-date). SDK 26/36/36 and prior Debug certificate retained.
  Packaged descriptor wrapper matches source; both generated native stream sources
  match source; packaged main config has no allow-navigation override; backup=false.
- Local APK SHA-256:
  `2d288d947d7aa607057d6ed13eeba399b48a0dfc241277ba89a94a0b509a1aef`,
  49,405,356 bytes. No new tablet download was published.
- At this initial stage the preview HTTP server still bound all interfaces,
  pending the user's LAN preference. The follow-up below resolves that binding
  choice, not the other authorization/concurrency findings.
- Remote CI remains unverified; the real-network harness is wired into the
  native regression job but source configuration is not a successful remote run.

## Follow-up: user-selected private preview

The user confirmed that other Wi-Fi devices do not need preview access. The
production `NanoHTTPDWebserver` now uses `super("127.0.0.1", port)` rather than
the wildcard constructor. There is no JS host option or fallback that broadens
the bind. All instances of this plugin, including the console server, use this
constructor. Existing local `http://localhost` preview URLs stay unchanged;
explicit custom external preview destinations are also unchanged. No LAN URL
advertisement was found in the current plugin/preview path.

At this binding-only stage, the change closed direct listening on LAN interfaces.
It did not authenticate clients
on the same device, prevent browser-based loopback requests, or fix the native
preview busy-wait, response-map leak, concurrency, symlink or guest-browser issues.
Those remain open; no new preview capability or lifecycle policy is claimed.

The subsequent [preview request/lifecycle work](preview-request-lifecycle.md)
addresses unauthenticated local requests, pending/worker bounds and explicit
revocation. It does not retroactively change the following binding-only results.

Follow-up validation on 2026-10-27:

- Full Vitest: 102 files / 968 tests passed, including 37 boundary regressions.
  Typecheck, targeted Biome, shell syntax and CI YAML parsing passed. Diff checks
  honor CRLF (`core.whitespace=cr-at-eol`) in the existing native source.
- New [real NanoHTTPD binding harness](../tests/security/preview-bind-audit/README.md):
  13 assertions passed. It compiles the complete production source with explicit
  Android/Cordova adapters, uses its real constructor/listener, and overrides only
  request handling to return dummy text. Actual socket address and IPv4/localhost
  HTTP passed; both active non-loopback IPv4 interfaces refused connections.
  This is not Android Wi-Fi or real file/bridge validation. CI is configured to
  run it; a remote successful run is still unverified.
- Removed/re-added the local server plugin with `--nosave`; source, installed
  plugin and generated Android Java hashes match. Android rebuild and signature
  passed in 16 seconds (62 tasks: 7 executed, 55 up-to-date). Min/target/compile
  SDK remain 26/36/36, with the same Debug certificate.
- New local APK SHA-256:
  `9431b96e1e059b248a7a63d0f798bc9801e5f9dced99993425c5441d96796af3`,
  49,405,356 bytes. No public APK replacement and no device/emulator testing.
  Prior scan/native-suite results above are historical; this binding-only change
  did not rerun those dependency, crypto or storage harnesses.

The [production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains blocked.
Source and stub/socket tests are not Android acceptance or complete security proof.
