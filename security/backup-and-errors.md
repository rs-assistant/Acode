# Backup and error-handling hardening

Android 12+ extraction rules now exclude every supported application data domain
from both cloud backup and device transfer: root, file, database, sharedpref,
external and all four device-protected variants. A root exclusion alone does not
exclude the separate preferences/database domains. `allowBackup=false` remains.
Domain names were checked against AOSP `android.app.backup.FullBackup`'s XML-domain
mapping. This deliberately prevents backup/transfer of editor app data as well as
credentials; separately back up your working files, without credential exports.
This does not delete data, erase previous backups or control user-managed exports.

SFTP callback/shell errors now use fixed, type-based categories. Raw library or
server exception messages, causes, stack traces and connection IDs are not sent
by the changed error/log paths. Diagnostic detail is reduced deliberately;
host-key rejection/changed-key structured metadata remains intact for verification.
Remote command output and terminal stream data are still returned as requested;
those are not sanitized exception messages and may contain whatever the server
or command prints. The harness tests dummy exceptions, not real Android logcat.

The independent native regression CI job uses pinned checkout/setup-java actions,
JDK 21 and a pinned/checksummed JSON test dependency. It needs no SSH credentials.
Local harness success is not evidence of remote CI or device test execution.
