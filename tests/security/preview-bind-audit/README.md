# Preview listener binding regression

Run `bash tests/security/preview-bind-audit/run.sh` with JDK 21, curl and sha256sum.
Dependencies are checksum-pinned official NanoHTTPD 2.3.1 and org.json jars.

This compiles the complete production `NanoHTTPDWebserver` source with explicit
Android/Cordova adapters. Its real constructor and NanoHTTPD listener are used;
the request handler is overridden to return dummy text, and adapters throw if
Android storage or the Cordova request bridge is reached. The harness checks the
actual bound socket, normal IPv4/localhost HTTP and refusal on active non-loopback
IPv4 interfaces. The latter prints SKIP when none are available. Proxy use is
disabled for these local requests. The listener binds an ephemeral port directly.

This is not an Android device, Wi-Fi firewall, native file-response, preview
authorization, lifecycle or concurrency test. A loopback-only listener still
allows other apps on the same device to connect; it is not authentication.
