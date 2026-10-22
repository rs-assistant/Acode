# On-device SSH key generation

## Reference and scope

The requested reference is Android SSHBorg:
[`payne1982/sshborg`, commit `1388c99d`](https://github.com/payne1982/sshborg/tree/1388c99d0570c393dd4eb915c82b65d85b2aa1db).
Reviewed its KeysScreen, KeysViewModel, KeystoreManager, SshManager key-generation
methods and host/key binding. The reference's separate key list, local generation,
public-key copy and host selection informed this workflow. Its code is GPL-3.0;
this is an independent implementation using Acode's existing Maverick/BC stack,
not copied source or a change to this repository's MIT license. In particular,
the reference's optional unencrypted storage/fallback is NOT reproduced.

This version supports Ed25519 and RSA-4096, public-key display/copy, a reusable
encrypted key list, SFTP/SSH profile binding, and confirmed local deletion.
It does not implement all SSHBorg features, ECDSA options, renaming, biometric
gates, private-key export/backup or automatic installation on remote servers.

## Tablet workflow

1. File Browser home → + → SSH keys / SSH 金鑰 → Generate SSH key.
2. Choose Ed25519 (usual first choice) or RSA-4096 and enter a label. Generation
   runs in the native background thread, not the WebView or a shell. No computer,
   Termux, installed terminal environment or network service is needed to generate.
3. Copy the **public** key. Using an existing login method, add that single line
   to the intended server account's `~/.ssh/authorized_keys` with appropriate
   ownership/permissions. Keep that login method until key authentication works.
   The app does not silently modify the server or use a stored password to enroll.
4. Long-press the SFTP connection → Edit → Saved SSH key / 已儲存 SSH 金鑰 → choose
   the key by label/fingerprint, then save/connect. Saved-key and imported-file
   authentication are separate choices; the old file/password flow is preserved.
5. Verify host identity independently. Client-key authentication does not replace
   SSH host-key verification. Test SFTP transfers and the SSH terminal separately.

Generated private keys have no separate file passphrase: their at-rest protection
is mandatory native encrypted storage backed by the Android Keystore master key.
They are never returned to JS, copied to the clipboard, exported as a file or
generated on the cloud machine for the user. Hardware backing and user/biometric
authentication are not claimed. Test-only JVM keys are unrelated to device keys.

## Storage and boundary

- Dedicated strict encrypted preferences: `acode_ssh_identity_keys_v1`, no
  plaintext fallback. A single synchronously committed encrypted catalog avoids
  partial public/private index updates. Maximum 32 keys; labels 1–80 characters;
  algorithms are allowlisted natively, without user-supplied weak RSA sizes.
- Actual Maverick/BC cryptographic APIs generate the material. The serialized
  private key is reloaded and its public bytes compared before committing.
- `listSshKeys`/`generateSshKey` return only keyId, label, algorithm, publicKey and
  SHA-256 fingerprint. The native store explicitly constructs that allowlist;
  JS also discards unexpected fields. There is no private-key export action.
- `editProfile` stores an opaque identityId, not a private-key copy. Native
  connection/shell builders resolve it at authentication time. Missing/deleted
  identities fail closed rather than falling back to a password.
- All new actions use the existing SFTP capability gate. SSH-safe mode still
  blocks third-party plugins before execution; these actions do not establish
  an independently authenticated same-realm caller identity.
- Temporary serialized/decoded byte arrays are cleared. Java Strings, JSON
  catalog copies, provider key objects and GC cannot guarantee complete memory
  erasure. A native compromise or privileged memory extraction is outside the
  protection offered by encrypted preferences; private SSH keys are not individually
  non-exportable Android Keystore signing handles.

## Loss and deletion

No private-key backup/export is provided. Uninstalling, clearing app data or
losing the device/master key can make these identities unrecoverable. Keep a
separate recovery/login method. Existing backup/device-transfer exclusions also
cover this vault. Existing password/file-key profiles are not migrated or deleted.

Deletion requires a native confirmation using the fixed day/night dialog theme;
cancel leaves the key intact. Profiles referencing a deleted key cannot initiate
fresh authentication with it. Deletion does NOT revoke public keys on servers,
cancel an in-flight handshake that already loaded key material, terminate existing
authenticated sessions, or promise forensic erasure. Disconnect sessions and
remove server-side authorized_keys entries separately when revocation is required.

Follow-up storage hardening rejects further access for that process after an
unconfirmed strict commit; a failed write does not guarantee unchanged cached
state. See [failure behavior and recovery](storage-failure-hardening.md).

## Validation

- Full suite: 97 files / 866 tests passed on the final run; typecheck and targeted
  Biome/diff checks passed. One existing JavaScript JSDoc-folding test failed
  during an earlier full run concurrent with Android compilation; the subsequent
  full run without that contention passed. Its code/assertions were not changed.
- Native core harness: 35 Tee + 11 error + 6 theme-selection assertions passed.
- New crypto/vault harness: 55 assertions use the actual project Maverick 3.1.4
  and BC 1.83 jars, not crypto mocks. Both algorithms sign/verify; OpenSSH parses
  their public keys and agrees on SHA-256 fingerprints. Tests cover serialization
  round trips, distinct generations, metadata allowlists, invalid inputs/IDs,
  failed commits/deletes/init, buffer clearing, capacity and corrupt-vault refusal.
- Android Context/preferences are adapters in that harness: it does NOT test
  real Android encryption, Keystore, bridge scheduling, dialog rendering or login.
- Android native compilation/signature and bundled UI build passed. The CI job
  includes the key harness, but remote CI execution is not claimed.

The [production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains BLOCKED.
Use disposable test accounts/keys until tablet generation, public-key copy,
key-authenticated SFTP/shell, reboots, deletion and old-profile regression checks
are completed. No production credentials or real server were used in local tests.

## Tablet test download

[Download the key-generation APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-keygen-20261022/acode-ssh-keygen-96a37beb-debug.apk).
Exact runtime source is `96a37bebb99ae0478b25811d68944fd404d36dd1`, artifact-only
commit `360e9b38b53b891dca6097a4c90f69e5155631d2`. See the
[publication record](ssh-keygen-apk-publication.json). An anonymous public fetch
returned HTTP 200 and matched all built bytes; the downloaded signature was
verified. All three previous tablet artifact branches and main remain unchanged.
Public download verification is not Android generation/Keystore/login testing.

Subsequent [tablet feedback](tablet-test-feedback.md) reports basic functional
success. It does not close the outstanding adversarial/deletion/failure checks.
