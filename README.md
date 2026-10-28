# Acode preview lifecycle test APK

Download `acode-preview-8d99d3b5-debug.apk` on Android and install it as an update.
Do not uninstall the existing application or clear its data. If Android reports a
signature conflict, stop instead of uninstalling.

- Source: `rs-assistant/Acode`, commit `8d99d3b54213a02b62d3f71e5d9ef6c4e32b3427`.
- Runtime change: `ffde27043ea8fd862ebe273a2ce23f7fed10cec7`.
- Application: `com.foxdebug.acode`, version `1.13.5`, versionCode `1011`.
- Uses the existing test Debug signing certificate, not a production certificate.
- Includes one-use preview bootstrap authorization, request bounds, timeouts,
  backpressure, and preview close/reset cleanup. Loopback-only preview is retained.
- This is a test APK. The new preview browser/Activity behavior still requires
  Android tablet verification; successful compilation is not security acceptance.

This branch contains only the APK and its metadata. Do not merge it into main.
No signing keystore, SSH private key, or access token is included.

See `SHA256SUMS` and `provenance.json` for artifact verification.
