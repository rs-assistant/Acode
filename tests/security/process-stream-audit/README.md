# Real-loopback process-stream integration regressions

```sh
bash tests/security/process-stream-audit/run.sh
```

Requires JDK 21 (javac/java), curl, sha256sum and `/bin/cat` on the Linux test host.
The real pinned Java-WebSocket 1.6.0 and SLF4J API 2.0.13 jars are checked by
SHA-256. Production ProcessServer.java is compiled unchanged: no fake WebSocket
or Android adapter participates in these socket/process tests.

35 assertions cover tokenless/malformed/wrong-server handshakes, legitimate text
and binary streams, direct read-only buffers, single ownership and duplicate
rejection without killing the legitimate stream, process cleanup, revocation,
idle expiry, closed-before-start, occupied-port startup failure and static error
messages. Only dedicated IPv4 loopback endpoints and disposable `/bin/cat` are
used; no SSH account, user credential, real project or external target is used.

The Origin header simulates an untrusted caller. These JVM tests do not prove
that any specific Android browser permits such a request through its mixed-content
or private-network policies. They also do not exercise Cordova reset callbacks
or Android process lifecycle; those still need device acceptance.
