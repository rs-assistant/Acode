# Real-library SSH key-generation regression harness

Run from repository root with JDK 21, curl, sha256sum and OpenSSH `ssh-keygen`:

```sh
bash tests/security/keygen-audit/run.sh
```

The script downloads the pinned project-version Maverick/BC dependencies and
org.json over verified HTTPS from Maven Central, checking each SHA-256. Cache and
compiled classes stay in task-specific temporary directories, not the source tree.
It compiles the actual `SshKeyMaterial.java` and `SshIdentityStore.java` unchanged.

The tests generate disposable Ed25519/RSA-4096 keys, parse them through the actual
SSH library and verify signatures. Only temporary **public** files are handed to
OpenSSH to check interoperability/fingerprints; no real account/host credentials,
production private key, SSH server or external authentication is used.

Storage is deliberately fake. The tests assert strict constructor selection and
commit/refusal behavior, not real encryption or Android Keystore. See
[design, limits and tablet steps](../../../security/ssh-key-generation.md).
