# Real-library SSH key-generation regression harness

Run from repository root with JDK 21, curl, sha256sum and OpenSSH `ssh-keygen`:

```sh
bash tests/security/keygen-audit/run.sh
```

The script downloads the pinned project-version Maverick/BC dependencies and
org.json over verified HTTPS from Maven Central, checking each SHA-256. Cache and
compiled classes stay in task-specific temporary directories, not the source tree.
It compiles the actual `SshKeyMaterial.java` and `SshIdentityStore.java` unchanged.
Current pinned BC artifacts are 1.86. A base-class overlap guard also rejects
duplicate dependency classes: official BC 1.85 jars passed JVM tests but failed
Android packaging, so JVM success alone must not be used as that release check.

The tests generate disposable Ed25519/RSA-4096 keys, parse them through the actual
SSH library and verify signatures. Only temporary **public** files are handed to
OpenSSH to check interoperability/fingerprints; no real account/host credentials,
production private key, SSH server or external authentication is used.

Storage is deliberately fake. The tests assert strict constructor selection and
commit/refusal behavior, not real encryption or Android Keystore. See
[design, limits and tablet steps](../../../security/ssh-key-generation.md).

An additional three fresh-JVM cases compile the **production preference manager**
and identity vault using the cache-first Android/AndroidX adapters from
preferences-audit. They exercise failed generation/deletion/thrown commit, then
verify all subsequent key use and namespace reopening are blocked. These add
30 assertions to the original 55 crypto/simple-storage assertions; they still
do not establish real Android encryption or storage durability.
