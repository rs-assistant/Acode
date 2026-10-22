# User-reported tablet feedback

These are user reports, not agent-observed Android instrumentation. Preserve the
scope rather than interpreting a short acknowledgement as a full security audit.

- Earlier SSH-safe edition: safe-mode notice and ordinary editing reported OK;
  SSH/SFTP connection reported working. Host-key dialog actions were reported
  invisible and then addressed by the separate themed-dialog build.
- Key-generation edition, exact source `96a37beb`, artifact branch
  `test/ssh-safe-keygen-20261022`: after the generation/public-key/profile-binding
  instructions the user reported **「測試成功」**.
- After a request to force-stop/reopen and test same-key login, SFTP transfers
  and SSH terminal, the user replied **「可以」**. Record this as positive basic
  functional feedback; no per-operation transcript, device model, Android version
  or independently observed Keystore evidence was provided.

The user has not reported failed-commit/storage exhaustion tests, malicious
normal/theme plugin execution-marker tests, changed-host-key refusal, or local
key deletion followed by fresh authentication refusal. Existing/in-flight
sessions are not expected to be revoked merely by deleting a local key.

Do not erase historical build-time verification records to make earlier device
checks appear completed. Later source changes need their own tablet acceptance.
The [production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains blocked.
