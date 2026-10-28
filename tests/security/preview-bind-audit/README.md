# Preview HTTP and lifecycle regressions

Run `bash tests/security/preview-bind-audit/run.sh` with JDK 21, curl and sha256sum.
Dependencies are checksum-pinned official NanoHTTPD 2.3.1 and org.json jars.

The runner compiles the complete production `NanoHTTPDWebserver`, `Server` and
browser `Plugin` with explicit Android/Cordova adapters, then runs three suites:

- `PreviewBindAudit`: 13 checks in this environment (count depends on available
  interfaces). Only this binding suite overrides the HTTP handler to dummy text.
  Checks actual socket address, IPv4/localhost HTTP and non-loopback refusal.
  The latter prints SKIP when no active non-loopback IPv4 interfaces are available.
- `PreviewRuntimeAudit`: 102 assertions against the real production HTTP handler,
  callback dispatch, response/deadline registry and plugin lifecycle. Real
  localhost sockets exercise unauthenticated refusal, one-time bootstrap/replay,
  cookie/Host/Origin/Fetch-Metadata gates, header filtering, asset paths, HEAD with
  and without gzip, method restrictions, timeout, late/duplicate completion,
  pending/connection/server limits, stop/reset/destroy, idle expiry, bind collision
  classification, cross-instance rejection and paused-WebView backpressure. A dummy Cordova responder supplies
  text; no production request handler override is used for these network checks.
  One focused overload check directly invokes `serve` with a session adapter.
- `BrowserCloseAudit`: 11 assertions exercise the production browser plugin with
  Activity/Cordova adapters: opened/closed callbacks, stale-result rejection,
  callback bounds/reset and unchanged ordinary external-browser completion.

Sockets explicitly use IPv4 loopback and proxy-free local clients. Dependencies
are official checksum-pinned jars; no tokens, passwords or real project files are
used. Deliberately closing active sockets can produce NanoHTTPD `Socket closed`
log messages; assertions still require pending/client cleanup and timely return.

This is not an Android device, browser-cookie rendering, Wi-Fi firewall, real
ContentResolver/file response, Keystore, Cordova scheduling or UI-lifecycle test.
Only the shortened idle timeout is clock-tested; the production 30-second
bootstrap validity and 15-minute idle values are configured in source. The JS
controller/wrapper suite separately uses explicit filesystem/browser adapters.
Authorized preview content and shared browser profiles are not isolated by these
cookies; see [boundaries and acceptance checklist](../../../security/preview-request-lifecycle.md).
