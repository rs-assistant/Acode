#!/usr/bin/env bash
set -euo pipefail
acode_repo=$(git rev-parse --show-toplevel)
acode_preview_fixture="$acode_repo/tests/security/preview-bind-audit"
acode_preview_deps="${TMPDIR:-/tmp}/acode-preview-bind-deps"
mkdir -p "$acode_preview_deps"
acode_preview_cp=""
while read -r acode_digest acode_group acode_artifact acode_version; do
  acode_jar="$acode_preview_deps/$acode_artifact-$acode_version.jar"
  if [ ! -s "$acode_jar" ]; then
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      --connect-timeout 15 --max-time 60 \
      "https://repo.maven.apache.org/maven2/${acode_group//.//}/$acode_artifact/$acode_version/$acode_artifact-$acode_version.jar" \
      --output "$acode_jar"
  fi
  printf '%s  %s\n' "$acode_digest" "$acode_jar" | sha256sum -c -
  acode_preview_cp="${acode_preview_cp:+$acode_preview_cp:}$acode_jar"
done <<'DEPENDENCIES'
de864c47818157141a24c9acb36df0c47d7bf15b7ff48c90610f3eb4e5df0e58 org.nanohttpd nanohttpd 2.3.1
3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed org.json json 20240303
DEPENDENCIES
acode_preview_classes=$(mktemp -d "${TMPDIR:-/tmp}/acode-preview-bind-classes.XXXXXX")
mapfile -t acode_preview_stubs < <(find "$acode_preview_fixture/stubs" -type f -name '*.java')
javac -cp "$acode_preview_cp" -d "$acode_preview_classes" \
  "${acode_preview_stubs[@]}" \
  "$acode_repo/src/plugins/server/src/android/com/foxdebug/server/NanoHTTPDWebserver.java" \
  "$acode_repo/src/plugins/server/src/android/com/foxdebug/server/Server.java" \
  "$acode_repo/src/plugins/browser/android/com/foxdebug/browser/Plugin.java" \
  "$acode_preview_fixture/PreviewBindAudit.java" \
  "$acode_preview_fixture/PreviewRuntimeAudit.java" \
  "$acode_preview_fixture/BrowserCloseAudit.java"
java -cp "$acode_preview_classes:$acode_preview_cp" PreviewBindAudit
java -cp "$acode_preview_classes:$acode_preview_cp" com.foxdebug.server.PreviewRuntimeAudit
java -cp "$acode_preview_classes:$acode_preview_cp" BrowserCloseAudit
