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
- On 2026-10-27, artifact branch `test/ssh-safe-apk-20261027`, source
  `fbc734a5c440856c95e8ff91846c527a4567efcd`, APK SHA-256
  `9431b96e1e059b248a7a63d0f798bc9801e5f9dced99993425c5441d96796af3`:
  the user reported **「可以更新並開啟」**. Asked whether prior settings/SSH keys
  remained and SFTP still connected, the user replied **「正常」**. This confirms
  user-reported basic upgrade/startup/retention/SFTP behavior for that build only.
  It predates the new preview-cookie/deadline/lifecycle changes, which have NOT
  been installed or accepted on the tablet. It is not evidence of failed-write,
  malicious-plugin, deletion/revocation or new browser-cookie acceptance.

The user has not reported failed-commit/storage exhaustion tests, malicious
normal/theme plugin execution-marker tests, changed-host-key refusal, or local
key deletion followed by fresh authentication refusal. Existing/in-flight
sessions are not expected to be revoked merely by deleting a local key.

Do not erase historical build-time verification records to make earlier device
checks appear completed. Later source changes need their own tablet acceptance.
The [production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains blocked.
