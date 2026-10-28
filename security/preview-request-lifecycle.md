# Preview request authorization and lifecycle

## Scope

The private preview remains bound to `127.0.0.1`. This follow-up replaces its
unbounded response-map polling with bounded waiting, authenticates HTTP clients,
and fences stale Cordova responses/stops to the specific server instance.
It does not change SSH credential storage, GitHub Secrets, the production gate,
`main`, or existing APK downloads. No new test APK is published by this change.

The user-reported working tablet baseline is source `fbc734a5`, artifact branch
`test/ssh-safe-apk-20261027`. That feedback covers basic update/startup, retained
settings/keys and SFTP, not the new preview protocol described here.

## Protocol and boundaries

- Native start returns `{port,id,token}`, not the old success string. The random
  128-bit instance ID is required on handler registration, send and stop. It is
  a stale-instance fence, NOT independently authenticated native caller identity.
  Legacy/malformed native descriptors fail closed; there is no bare-URL fallback.
- Browser opening waits for an explicit native handler-ready event. The bundled
  wrapper produces a localhost URL with a random 256-bit `__acode_preview` query
  capability. It is valid for at most 30 seconds from server construction and
  can be consumed only once. Do not log, persist, copy or share that opening URL.
- The bootstrap replies 303, removes the reserved capability parameter while
  retaining ordinary query parameters, and sets a separate per-instance secret
  in a host-only HttpOnly, SameSite=Strict session cookie. Cookie names include
  the listener port. The clean URL keeps normal root/relative asset paths usable.
  If opening the browser takes over 30 seconds, start a fresh preview from Acode.
- HTTP must have an exact localhost/IPv4-loopback Host with the actual port.
  Present Origin must match that HTTP origin. Present Fetch-Metadata must be
  `same-origin` or `none`; cross-site and cross-port `same-site` requests fail.
  Cookie/Authorization/Referer headers are withheld from the main JS handler.
  Rejections happen before request UUID allocation, bridge dispatch or file work.
- Preview only accepts GET/HEAD. It no longer parses POST/PUT upload bodies.
  Responses use no-store and no-referrer. The bootstrap cookie is intentionally
  not marked Secure because this existing listener uses HTTP loopback; this is
  not a change to global Android cleartext policy or an HTTPS security claim.
- Ordinary custom external preview destinations remain unchanged. Hard-coded
  URLs using a different host spelling, port or unauthorized browser context do
  not gain the cookie automatically; use same-origin relative resource URLs.

## Resource limits and revocation

- At most four listeners per native plugin; retired idle entries are pruned on
  the next start. Each has at most eight TCP workers/connections with no waiting
  executor queue. Excess accepted sockets are closed. Socket read timeout is five
  seconds. These limits bound resource use; they do not promise local DoS immunity.
- At most eight pending JS responses per listener, each with a monotonic
  ten-second deadline including bridge-dispatch time. Response completion after
  the deadline, duplicates and unknown IDs fail. Completion, error, timeout and
  stop all remove pending entries; there is no busy-wait or retained response map.
- A separate bounded set retains at most eight dispatched IDs until JS completes
  or discards them. HTTP timeout does not replenish that budget by itself: a
  paused WebView cannot accumulate a fresh batch of bridge messages indefinitely.
  Only IDs remain after future cleanup; response data is not retained. JS discard
  releases a delivery slot but never accepts an expired HTTP response. Stop also
  clears these tickets, and idle expiry reclaims a non-draining listener.
- The wrapper retains at most eight live request IDs, drops expired sends and
  clears state on stop. Main-controller file work has a bounded eight-item queue
  and a finally-based FIFO drain, including provider errors. Late replies target
  the captured server, not the mutable global newest server. Async read failures
  produce a static response rather than unhandled promises or private error text.
  Native messages include an advisory wall-clock expiry so JS can discard work
  that sat in the bridge queue instead of renewing its full timeout on receipt.
  The native monotonic deadline remains authoritative; clock adjustments may
  reject work early but cannot extend native response authorization.
- Stop, Cordova reset and destruction revoke native waiters/cookies/listeners.
  A stopped server cannot restart. IDs prevent an old JS callback from stopping
  or sending into a replacement listener using the same port. Only actual port
  collisions trigger port retry; the main controller limits retries to ten.
- The in-app browser optionally returns opened/closed events through Activity
  results; closing it stops that preview and clears queued work. Generic browser
  callers retain their old completion contract. Native close-callback state is
  bounded and released on reset/destroy.
- Closing an external browser cannot be reliably observed by this app. A shared
  daemon reaper stops listeners after fifteen minutes without an accepted request
  (checked at intervals up to thirty seconds); re-open preview from Acode after
  expiry. Main-app pause alone does not revoke it, because launching a browser
  pauses the main activity. In-app close delivery still needs real Android checks.

## Tests and findings

Validation resumed on 2026-10-28 after the previous environment disconnected:

- Vitest: 104 files / 1001 tests, exit 0; typecheck, scoped Biome, scoped JS/Java
  Prettier, shell syntax and diff checks passed. The 23-test lifecycle suite
  executes the real bundled wrapper, browser JS and main controller with explicit
  adapters, including late filesystem results, provider failure/FIFO progress,
  stale window close and unknown console routes. Some separate tests are source
  regression checks, not functional Android evidence.
- Preview harness: 13 binding assertions, 102 production HTTP/deadline/registry
  assertions and 11 production browser-plugin callback assertions, all passed.
  The HTTP suite uses the actual handler with real NanoHTTPD sockets and a dummy
  Cordova text responder, not an overridden network handler. Only the separate
  binding suite overrides serving. Its two non-loopback interfaces were refused.
- The 35 real-loopback terminal-stream assertions passed again. The local run
  did not repeat existing crypto/storage-failure or Maven/npm advisory suites;
  historical results are not presented as new local checks or advisory scans.
- Regression tests found that NanoHTTPD 2.3.1 writes fixed-length HEAD bodies.
  The server now closes/replaces the payload stream for HEAD and disables HEAD
  gzip emission while keeping metadata. Both raw HEAD cases pass. Tests also
  exposed an invalid SAF URI in a new fixture; it was replaced with a real-format
  dummy content URI without weakening the queue/failure assertions.
- A loaded-machine full run also exposed an existing JSDoc folding test's
  dependency on initial parsing finishing within CodeMirror's short state-init
  budget. The test now explicitly completes parsing and commits that context to
  an editor state before the unchanged fold-range assertion. No language/parser
  application code or folding assertion was disabled.
- Deliberately stopping active HTTP clients can cause NanoHTTPD `Socket closed`
  logs. They contain no URLs/cookies here; tests still require bounded completion
  and cleared pending/client state. This is not hiding a failed transport test.

- Final pre-commit Android build passed in 17 seconds (62 tasks: 3 executed,
  59 up-to-date). APK signature and 16-KiB zip alignment verified; min/target/
  compile SDK remain 26/36/36, package/version remain com.foxdebug.acode 1.13.5
  (1011), and the prior Debug certificate is unchanged. Packaged backup=false,
  extraction-rule reference and existing cleartext=true settings were inspected.
- Generated preview/server/browser-plugin Java matches source. Packaged preview
  wrapper contains the exact current source and packaged main JS matches the
  bundler output. This is source/package consistency, not independent Android
  execution or a DEX-level security proof.
- Local unpublished APK: 49,405,784 bytes; SHA-256
  `ce34978239e6a77c0d1466076ccc424ff3ccf06be950800bc9930d2ce0bb91e6`.
  No new artifact branch, Release or device download replaces the known working
  fbc734a5 tablet build. Remote CI results must be checked for the eventual
  committed source rather than inferred from these local results.
- Clean worktree source `ffde27043ea8fd862ebe273a2ce23f7fed10cec7` rebuilt and
  verified successfully in 10 seconds (62/62 tasks up-to-date), retaining that
  exact APK hash. Private archive:
  `/workspace/acode-cloud/artifacts/acode-preview-ffde2704-debug.apk`.
- [Remote CI for that exact source](https://github.com/rs-assistant/Acode/actions/runs/40627629861)
  completed successfully: unit tests, native security regressions, formatting and
  spelling all passed; translation was conditionally skipped. Status/job evidence
  was read through the GitHub API, not by inventing remote assertion counts. The
  native CI job includes its existing policy/storage/crypto suites as well as the
  terminal and new preview harnesses. This is not the manual signing/upload
  workflow, a new advisory inventory, browser rendering or Android acceptance.

## Remaining limits and device acceptance

- HTTP capabilities do not isolate authorized preview JavaScript, the main
  WebView realm, compromised/rooted devices, or other code sharing the authorized
  browser profile. Cookies are not port-scoped security boundaries. Reusing the
  same origin/port can let an old same-origin page use renewed ambient authority;
  Origin/Fetch-Metadata checks do not provide per-project browser isolation.
- The old path guard is not a canonical filesystem/symlink jail. Real SAF/file
  serving, range/error behavior and full separate-browser policies still need
  review and Android acceptance. This patch does not claim a complete preview
  sandbox or comprehensive native caller authentication.
- Already-started filesystem/SFTP/provider calls cannot necessarily be cancelled
  by clearing pending HTTP work. Their results are not delivered to a replacement
  preview; blocking native file/provider reads and bridge dispatch are not proven
  preemptible by this deadline or by JVM adapters.
- The short idle timeout is clock-tested with an injected constructor limit.
  The production 30-second bootstrap lifetime and fifteen-minute idle values are
  configured in source, not validated by waiting out both durations in CI.
- No Android browser rendering, cookie persistence/redirect behavior, Activity
  scheduling, rotation/recreation or external-browser refresh/close was exercised.
  Future device checks should cover normal HTML/CSS/images/console, refresh after
  the clean redirect, rapid preview replacement, closing/reopening, file-provider
  errors, background/main-WebView pause/resume, wall-clock changes and raw tokenless
  HTTP refusal; then basic SFTP regression. The user's
  baseline APK feedback does not establish any of these new-protocol behaviors.

The [SSH production gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) stays BLOCKED.
