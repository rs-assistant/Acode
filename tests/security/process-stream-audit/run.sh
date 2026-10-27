#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_stream_deps="${TMPDIR:-/tmp}/acode-process-stream-deps"
mkdir -p "$acode_stream_deps"
acode_stream_cp=""
while read -r acode_digest acode_group acode_artifact acode_version; do
  acode_jar="$acode_stream_deps/$acode_artifact-$acode_version.jar"
  if [ ! -s "$acode_jar" ]; then
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      --connect-timeout 15 --max-time 60 \
      "https://repo.maven.apache.org/maven2/${acode_group//.//}/$acode_artifact/$acode_version/$acode_artifact-$acode_version.jar" \
      --output "$acode_jar"
  fi
  printf '%s  %s\n' "$acode_digest" "$acode_jar" | sha256sum -c -
  acode_stream_cp="${acode_stream_cp:+$acode_stream_cp:}$acode_jar"
done <<'DEPENDENCIES'
eae29213e4f16515639c28957200f011b3967fffcada1962cf0255d24919c22f org.java-websocket Java-WebSocket 1.6.0
e7c2a48e8515ba1f49fa637d57b4e2f590b3f5bd97407ac699c3aa5efb1204a9 org.slf4j slf4j-api 2.0.13
DEPENDENCIES
acode_stream_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-process-stream-classes.XXXXXX")
javac -cp "$acode_stream_cp" -d "$acode_stream_classes" \
  "$acode_repo/src/plugins/terminal/src/android/ProcessServer.java" \
  "$acode_repo/tests/security/process-stream-audit/ProcessStreamAudit.java"
java -cp "$acode_stream_classes:$acode_stream_cp" com.foxdebug.acode.rk.exec.terminal.ProcessStreamAudit
