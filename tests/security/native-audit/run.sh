#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_fixture="$acode_repo/tests/security/native-audit"
acode_deps="${TMPDIR:-/tmp}/acode-native-audit-deps"
mkdir -p "$acode_deps"
acode_json="$acode_deps/json-20240303.jar"
if [ ! -s "$acode_json" ]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar \
    --output "$acode_json"
fi
# org.json 20240303, downloaded over verified TLS from Maven Central and
# cross-checked against Central's SHA-1 sidecar before pinning SHA-256 here.
printf '%s  %s\n' \
  3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed \
  "$acode_json" | sha256sum -c -
acode_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-native-audit.XXXXXX")
mapfile -t acode_stubs < <(find "$acode_fixture/stubs" -name '*.java' -type f)
javac -cp "$acode_json" -d "$acode_classes" \
  "${acode_stubs[@]}" \
  "$acode_repo/src/plugins/pluginContext/src/android/Tee.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SftpErrors.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SftpDialogTheme.java" \
  "$acode_fixture/TeeAudit.java" \
  "$acode_fixture/SftpErrorsAudit.java" \
  "$acode_fixture/SftpDialogThemeAudit.java"
java -cp "$acode_classes:$acode_json" TeeAudit
java -cp "$acode_classes:$acode_json" com.foxdebug.sftp.SftpErrorsAudit
java -cp "$acode_classes:$acode_json" com.foxdebug.sftp.SftpDialogThemeAudit
