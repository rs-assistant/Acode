#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_pref_fixture="$acode_repo/tests/security/preferences-audit"
acode_pref_deps="${TMPDIR:-/tmp}/acode-native-audit-deps"
mkdir -p "$acode_pref_deps"
acode_pref_json="$acode_pref_deps/json-20240303.jar"
if [ ! -s "$acode_pref_json" ]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 60 \
    https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar \
    --output "$acode_pref_json"
fi
printf '%s  %s\n' \
  3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed \
  "$acode_pref_json" | sha256sum -c -
acode_pref_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-preferences-audit.XXXXXX")
mapfile -t acode_pref_stubs < <(find "$acode_pref_fixture/stubs" -name '*.java' -type f)
javac -cp "$acode_pref_json" -d "$acode_pref_classes" \
  "${acode_pref_stubs[@]}" \
  "$acode_repo/src/plugins/auth/src/android/EncryptedPreferenceManager.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SftpSecurityStore.java" \
  "$acode_pref_fixture/PreferencesAudit.java" \
  "$acode_pref_fixture/SecurityStoreAudit.java"
java -cp "$acode_pref_classes:$acode_pref_json" PreferencesAudit
# Each process starts with fresh process-local failure latches; no test reset API.
for acode_pref_case in save delete trust; do
  java -cp "$acode_pref_classes:$acode_pref_json" com.foxdebug.sftp.SecurityStoreAudit "$acode_pref_case"
done
