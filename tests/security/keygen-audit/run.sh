#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_key_deps="${TMPDIR:-/tmp}/acode-ssh-key-audit-deps"
mkdir -p "$acode_key_deps"
acode_key_cp=""
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
done <<'DEPENDENCIES'
3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed org.json json 20240303
68edfade4d9729d56ff280095005fe99338c9f9f5be58a005f0fe17a38fc8202 com.sshtools maverick-utils 3.1.4
d2ce276dbab41e64a0e290d6c90bad2d5d665aa8f88b6d08268b6b761888f617 com.sshtools maverick-logging 3.1.4
2c078f5918467119228ef481d0ec4ee255f6f61a5c2c03892db64dd86a0d2280 com.sshtools maverick-synergy-common 3.1.4
d66e9deb91aaa53173a9ec49b0c8c388b624e82c5cbbfb78fbcb4c9d2a0ab52f com.sshtools maverick-base 3.1.4
9a5acf6211998379126f1b9b941deda22edbc449c4f9196b30d191b39e917ab0 com.sshtools maverick-synergy-client 3.1.4
048f19e51557d7c08ae9de683cf5ce2b32fda49304afa968ec3737850e228c54 org.bouncycastle bcprov-jdk15to18 1.83
2d0b476e7c2fd8e75a622f287bf2e386b793720e4172eecc4274cf0b84e95197 org.bouncycastle bcpkix-jdk15to18 1.83
e3463d037577f1639a618c5140e021965fb5b1be5a57091571a519647b5c2d92 org.bouncycastle bcutil-jdk15to18 1.83
DEPENDENCIES
acode_key_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-keygen-classes.XXXXXX")
javac -cp "$acode_key_cp" -d "$acode_key_classes" \
  "$acode_repo/tests/security/native-audit/stubs/android/content/Context.java" \
  "$acode_repo/tests/security/native-audit/stubs/com/foxdebug/acode/rk/auth/EncryptedPreferenceManager.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshKeyMaterial.java" \
  "$acode_repo/src/plugins/sftp/src/com/foxdebug/sftp/SshIdentityStore.java" \
  "$acode_repo/tests/security/keygen-audit/KeygenAudit.java"
java -cp "$acode_key_classes:$acode_key_cp" com.foxdebug.sftp.KeygenAudit
