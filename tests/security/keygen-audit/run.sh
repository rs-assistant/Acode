#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_key_deps="${TMPDIR:-/tmp}/acode-ssh-key-audit-deps"
mkdir -p "$acode_key_deps"
acode_key_cp=""
acode_key_jar_files=()
while read -r acode_digest acode_group acode_artifact acode_version; do
  acode_jar="$acode_key_deps/$acode_artifact-$acode_version.jar"
  if [ ! -s "$acode_jar" ]; then
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      --connect-timeout 15 --max-time 60 \
      "https://repo.maven.apache.org/maven2/${acode_group//.//}/$acode_artifact/$acode_version/$acode_artifact-$acode_version.jar" \
      --output "$acode_jar"
  fi
  printf '%s  %s\n' "$acode_digest" "$acode_jar" | sha256sum -c -
  acode_key_cp="${acode_key_cp:+$acode_key_cp:}$acode_jar"
  acode_key_jar_files+=("$acode_jar")
done <<'DEPENDENCIES'
3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed org.json json 20240303
68edfade4d9729d56ff280095005fe99338c9f9f5be58a005f0fe17a38fc8202 com.sshtools maverick-utils 3.1.4
d2ce276dbab41e64a0e290d6c90bad2d5d665aa8f88b6d08268b6b761888f617 com.sshtools maverick-logging 3.1.4
2c078f5918467119228ef481d0ec4ee255f6f61a5c2c03892db64dd86a0d2280 com.sshtools maverick-synergy-common 3.1.4
d66e9deb91aaa53173a9ec49b0c8c388b624e82c5cbbfb78fbcb4c9d2a0ab52f com.sshtools maverick-base 3.1.4
9a5acf6211998379126f1b9b941deda22edbc449c4f9196b30d191b39e917ab0 com.sshtools maverick-synergy-client 3.1.4
fc50334d4d87b4272e72fa95ca748ead05bdef02ef760a5b13f64ffee317cd81 org.bouncycastle bcprov-jdk15to18 1.86
cf70d32101e53c3f92d55ba5c5f1329af51a9a44057fd21e81e20cfd6cd64953 org.bouncycastle bcpkix-jdk15to18 1.86
e72ef8a0fcad295207529b268ee02eb72acc7c83ec2e3a9df90cbed9380e3990 org.bouncycastle bcutil-jdk15to18 1.86
DEPENDENCIES
# The 1.85 official BC jars passed JVM tests but shared a base class and failed
# Android's duplicate-class check. Catch that before compilation in this harness.
# Ignore module descriptors and multi-release metadata, not actual base classes.
acode_key_duplicates=$(for acode_key_scan_jar in "${acode_key_jar_files[@]}"; do
  jar tf "$acode_key_scan_jar"
done | awk '/\.class$/ && !/^META-INF\// && !/(^|\/)module-info\.class$/ {print}' | sort | uniq -d)
if [ -n "$acode_key_duplicates" ]; then
  printf 'Duplicate dependency base classes detected:\n%s\n' "$acode_key_duplicates" >&2
  exit 1
fi
printf 'Dependency JAR base-class overlap check passed\n'
acode_key_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-keygen-classes.XXXXXX")
javac -cp "$acode_key_cp" -d "$acode_key_classes" \
  "$acode_repo/tests/security/native-audit/stubs/android/content/Context.java" \
  "$acode_repo/tests/security/native-audit/stubs/com/foxdebug/acode/rk/auth/EncryptedPreferenceManager.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshKeyMaterial.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshIdentityStore.java" \
  "$acode_repo/tests/security/keygen-audit/KeygenAudit.java"
java -cp "$acode_key_classes:$acode_key_cp" com.foxdebug.sftp.KeygenAudit
# Also exercise the production preference manager, not the simpler crypto-only
# harness's storage fake. These adapters deliberately change memory on failed disk
# writes, matching the failure ordering that the native manager must handle.
acode_key_strict_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-keygen-strict.XXXXXX")
mapfile -t acode_key_pref_stubs < <(find "$acode_repo/tests/security/preferences-audit/stubs" -name '*.java' -type f)
javac -cp "$acode_key_cp:$acode_key_classes" -d "$acode_key_strict_classes" \
  "${acode_key_pref_stubs[@]}" \
  "$acode_repo/src/plugins/auth/src/android/EncryptedPreferenceManager.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshKeyMaterial.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshIdentityStore.java" \
  "$acode_repo/tests/security/keygen-audit/IdentityFailureAudit.java"
for acode_key_failure in generate delete exception; do
  java -cp "$acode_key_strict_classes:$acode_key_cp" com.foxdebug.sftp.IdentityFailureAudit "$acode_key_failure"
done
