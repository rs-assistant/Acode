# Plugin secret storage hardening

Plugin identifiers no longer select arbitrary Android preference files.
Accepted identifiers are bounded ASCII names without filesystem separators;
the app-owned `acode_*` identifier space is rejected before token issuance.
The native secret accessor derives `acode_plugin_secrets_v1_<SHA-256(id)>` and
always requests encrypted storage with plaintext fallback disabled.

The four secret operations use this same accessor. Reset and destruction revoke
plugin tokens, permission grants and SFTP capabilities. Native dispatch is
serialized with reset so an old session cannot pass validation and issue a new
token concurrently with revocation.

## Compatibility and migration

This is a deliberate storage-format cutover for third-party plugin secrets.
Old encrypted stores are left intact, but are not automatically read or migrated
by a JavaScript-supplied identifier. That would reopen the app-store access path.
Users of plugins that stored secrets must re-enter those plugin credentials in
the new build. SSH profiles and known-host stores keep their original format.
The original tablet APK is unaffected because no replacement has been deployed.

## Verification limits

The Java regression harness compiles the real Tee.java with dummy Android,
Cordova and preference adapters. It covers invalid/reserved identifiers, separate
stores, CRUD, failed initialization, malformed manifests, reset and destruction.
Real Android Keystore behavior and data compatibility still require device tests.

This closes the app-owned namespace selection defect. It does not authenticate
native callers or protect one plugin's token against another script in a shared
realm. The public filesystem/terminal wrappers and Cordova provider paths remain
release blockers until plugin/SSH isolation is implemented and device-tested.
