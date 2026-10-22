# Acode tablet test APK

This branch distributes one previously built Debug APK for tablet testing.
It is an artifact-only branch, not the application's source branch.

## Download and install on an Android tablet

1. Open [Download app-debug.apk](https://github.com/rs-assistant/Acode/raw/refs/heads/test/tablet-apk/app-debug.apk) in Chrome.
2. Open the downloaded APK from Downloads or My Files.
3. If Android asks, allow Chrome or My Files to install unknown apps, then install.
4. Disable that installation permission afterwards if you enabled it.

If the direct download does not start, open
[the APK's GitHub file page](https://github.com/rs-assistant/Acode/blob/test/tablet-apk/app-debug.apk)
and select **Download raw file**.

If an existing Acode installation has a different signing certificate, Android
may reject the update. Back up local files and settings before uninstalling it.

## Build details

- Application version: 1.13.5, paid variant, Debug configuration.
- Built: 2026-10-20.
- APK size: 43,234,795 bytes.
- Source workspace: `security/ssh-native-hardening`, baseline commit
  `ef7f32656a5c4216209ac7e8d24e81bb1564ff8b`, plus uncommitted workspace changes.
- Android build, APK signature verification, 16 related regression tests, and
  TypeScript checking passed before distribution.

SHA-256:
`d4bb10db18b664cd74b10ecfa723e4c8f43687cea41af92fe8f8cf06fece4bfb`

The source workspace changes are not represented by the baseline commit alone;
this artifact-only branch does not claim to be a reproducible source release.

## Test status

Device testing and adversarial SSH runtime testing have not been completed.
The APK lacks explicit backup disabling/data extraction rules and permits
cleartext traffic. Use dummy SSH credentials for testing; this build has not
cleared the SSH production release gate.

The APK is public on this test branch. No Release signing key or upload token
was required to distribute this Debug build.
