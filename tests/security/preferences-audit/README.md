# Production preference-manager failure regressions

```sh
bash tests/security/preferences-audit/run.sh
```

Requires JDK 21, curl and sha256sum. The script checks the pinned org.json jar
over verified TLS and compiles the **production** EncryptedPreferenceManager and
SftpSecurityStore. The Android and AndroidX classes are deliberately adapters:
there is NO real encryption, Keystore, filesystem durability or device lifecycle.

Unlike the older native-audit storage fake, this adapter updates the preference
cache **before** returning false or throwing from commit. Tests cover a failed
write, reads by an already-open sibling manager, attempted namespace reopening,
concurrent access while a commit is unresolved, every strict getter/write path,
profile save/delete and host trust. A failed commit cannot be modeled as a
transaction that simply leaves the in-memory state unchanged.

Strict namespaces fail closed for the remaining process lifetime after an
unconfirmed commit. There is intentionally no production/test reset API. Each
SFTP-store failure case runs in a fresh JVM. Legacy two-argument constructor
behavior remains compatible; SSH stores always use the strict constructor.

See [storage-failure behavior and recovery](../../../security/storage-failure-hardening.md).
