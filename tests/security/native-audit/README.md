# Native Tee audit harness

Run from the repository root with JDK 21, curl, and sha256sum:

```bash
bash tests/security/native-audit/run.sh
```

The script compiles the current application's `Tee.java`, unchanged, together
with the adapters under `stubs/` and the pinned org.json 20240303 jar. The first
run downloads that jar from Maven Central over verified TLS and checks its
SHA-256. Compiled classes and dependency cache stay outside the checkout.

The harness checks the actual native action dispatch, preference namespace
selection, fallback constructor argument, and token state after `onReset`.
Only dummy records are used. Android Context, Cordova callbacks and preference
storage are test doubles: this does not exercise Android Keystore, encryption,
the Cordova Java bridge, an APK, a device, or SSH networking.

On this hardening branch, the harness requires rejection of reserved/invalid
identifiers, separate stores, working CRUD, fail-closed behavior, manifest
validation, and token/capability revocation on reset/destroy. These are now
regression assertions for the fixes, not successful exploit assertions. The
historical tablet-source branch retains the earlier characterization harness.
This does not validate actual encrypted Android storage or native caller identity.

See [the audit report](../../../security/tablet-ssh-audit.md) for the combined
JS/native evidence and remaining device checks.
