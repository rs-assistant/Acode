# Tablet feedback: SSH dialogs and key authentication

## User feedback

For the first SSH-safe tablet artifact (source `e1b32fc7`), the user reported:

- SSH safe-mode notice: OK.
- Ordinary file editing/saving: OK.
- SFTP connection: works. The authentication method was not explicitly recorded.
- Host-key fingerprint dialog: action buttons are not visible.
- Private-key authentication: instructions requested; success is not yet reported.

Tablet model, Android version, night mode and dialog screenshot have not been
supplied. These basic results do not close the adversarial/runtime release gate.

## Source diagnosis and targeted fix

`res/android/values/colors.xml` defines `teardrop` as `#FFFFFF`; the activity
sets both its AppCompat and framework accent to that color. SFTP previously
constructed framework AlertDialogs with the activity's default theme. White
accent labels on a light dialog are a strong source-level explanation of the
reported invisible buttons; no screenshot/device reproduction is claimed.

SFTP now explicitly selects the framework Material light/dark alert theme based
on the native configuration's night-mode mask. The activity-wide accent is not
changed. All three native security dialogs use this builder: unknown host,
changed host key, and saved-profile deletion. Trust/cancel listeners, fingerprint
comparison/storage and changed-key blocking are unchanged. No default acceptance,
blind-tap workaround, host-key reset or verification bypass was added.

Local validation: 845 JS tests / 95 files, typecheck, 34 Tee assertions,
11 error assertions and 6 native theme-selector assertions passed. Initial
Android build/signature passed (17 seconds, 62 tasks, 4 executed/58 up-to-date).
Selector tests use Android adapters, not rendered UI. Actual button contrast,
layout, large fonts and window/keyboard interactions remain device checks.

## Private-key login in this edition

1. Use a disposable test key pair. Install the public key (the `.pub` file) in
   the test account's server-side `~/.ssh/authorized_keys` with correct ownership
   and permissions. The server must permit public-key authentication.
2. In Acode's file-browser home, long-press the saved SFTP connection and choose
   Edit. Under Authentication type, choose Key file / 金鑰檔案.
3. Select the **private** key, such as `id_ed25519` or `id_rsa`, not `.pub` or
   `authorized_keys`. Use an OpenSSH-format test key; other key formats have not
   been verified on the tablet.
4. Enter the private key's passphrase if it has one. This is not the remote
   account password. Leave it blank only for an unencrypted test key.
5. Save/connect and independently verify the host fingerprint before accepting
   a new host. Client key authentication does not replace server identity checks.

Do not send private keys/passphrases in chat or use production keys for this
test build. Importing a key does not remove the original key file from the
tablet's filesystem; protect that original copy too. Do not erase trusted-host
records merely to recreate the dialog. A new controlled test endpoint can be
used for testing unknown-host prompts without changing an existing trust record.

## Separate dialog-fix test APK

[Download the dialog-fix APK](https://github.com/rs-assistant/Acode/raw/refs/heads/test/ssh-safe-apk-20261022-dialog-fix/acode-ssh-safe-ffb1bfd1-debug.apk).
Exact runtime source is `ffb1bfd1764a96e2b04b44a96b3c9c554cd7595d`; the
artifact-only commit is `c328cac5e436720e66caab2078e6395e25a4344d`.
See [the publication record](ssh-dialog-apk-publication.json) and its pinned
provenance/instructions. Anonymous public download returned HTTP 200 and matched
the built APK byte-for-byte; its signature was reverified. Both earlier tablet
download branches remain unchanged. Actual dialog visibility, upgrade and
private-key authentication still require user/device confirmation.
