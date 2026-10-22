# Failed SSH storage writes: cache is not durable state

## Findings and fix

Android SharedPreferences updates its process-local cache before a synchronous
commit can report disk failure. Returning false does **not** promise that the
previous in-memory value was preserved. The older crypto harness's simple fake
did preserve it, so those assertions alone could not establish Android failure
handling. No actual tablet disk failure was reported or reproduced.

The production EncryptedPreferenceManager now shares a lock and failure latch
across strict managers for each namespace. It holds the lock across read/write
access and commit completion. On a false result or runtime exception from commit,
subsequent reads/writes and constructor reopening of that strict namespace are
rejected for the rest of the process lifetime. Strict void write methods also
commit synchronously instead of scheduling unchecked apply writes. Legacy
non-strict callers retain their existing behavior; SSH credentials, identities,
known hosts and per-plugin secrets already use strict managers.

SftpSecurityStore now rejects invalid deletion IDs and checks removeSync's return
value. The native confirmation callback reports failure instead of always
reporting success or allowing an exception to escape the click handler.

This does not roll back disk writes, prove which value survived a failure,
revoke key pairs already loaded for an in-flight handshake, or terminate existing
sessions. It does not erase data. Separate manager instances' whole catalog
read-modify-write sequences are not made transactional by the per-access lock.

## Recovery

If saving, trusting a host or deleting credentials reports a storage failure,
do not assume the change succeeded or that the old value remains. Resolve disk
space/storage availability, force-stop and restart the app, then inspect the
persisted state and independently recheck host identity before connecting. An
in-process WebView reload is deliberately insufficient to reset the latch.
**Do not clear app data or uninstall to recover**: generated private keys cannot
be exported/backed up. Keep an independent login method. Already authenticated
sessions/server authorized_keys require separate disconnection/revocation.

## Local validation

- Full Vitest: 97 files / 888 tests passed. Policy-entry checks now exercise all
  six entry points under normal safe policy, native error, missing fields and
  conflicting permissions, asserting no filesystem/script/install side effects.
- Preferences/SFTP failure harness: 56 + 8 + 8 + 7 = 79 assertions against the
  actual production classes, with cache-first Android/AndroidX adapters.
- Actual-library crypto harness: original 55 assertions plus 30 new assertions
  using the production preference manager and identity vault under failed
  generation, deletion and thrown commit, including sibling/reopen rejection.
- Existing native harness: 35 Tee + 11 safe-error + 6 theme assertions passed.
- Typecheck, targeted Biome and diff checks passed. Device storage-failure,
  Keystore and Cordova UI scheduling are NOT established by these JVM tests.
- Android native rebuild/signature passed: 20 seconds, 62 tasks (13 executed,
  49 up-to-date). APK inspected as min/target/compile 26/36/36 with no flavour
  flag, backup false, all 18 extraction exclusions; cleartext remains enabled
  for the existing localhost workflows.

## Build target regression

The prepare hook previously silently chose target SDK 28 when fdroid.bool was
missing. Previously published hardened APKs worked around this and were inspected
as target 36. The hook now restores Cordova's configured SDK expression by default
(config.xml currently selects 36), including after a prior F-Droid prepare.
Only an explicit true flag retains the existing F-Droid SDK-28 compatibility
override; false or no flag uses the configured target, invalid content aborts.
Four new hook tests execute the real script with temporary filesystem fixtures.
Actual APK inspection is still necessary; tests alone are not package metadata.

Production credential approval remains [BLOCKED](SSH_PRODUCTION_RELEASE_BLOCKED.md).
