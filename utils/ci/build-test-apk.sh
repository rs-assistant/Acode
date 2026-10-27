#!/usr/bin/env bash
# Run from a fresh repository root after npm ci. No release/signing secrets here.
set -euo pipefail

if [ -d platforms/android ]; then
  echo 'Use a fresh disposable checkout; this script will not overwrite an existing Android project.' >&2
  exit 1
fi
node -e 'const fs = require("fs"); const xml = fs.readFileSync("config.xml", "utf8"); if (!/<widget\s[^>]*\bid="com\.foxdebug\.acode"/.test(xml)) process.exit(1)'
acode_build_tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/acode-apk-build.XXXXXX")
export TMPDIR="$acode_build_tmp"
sha256sum package.json package-lock.json config.xml > "$acode_build_tmp/inputs.sha256"
mkdir -p www/css/build www/js/build
npx --no-install cordova platform add android --nosave
npx --no-install rspack build --mode development
npx --no-install cordova prepare android --nosave

# Bootstrap from the pinned Gradle installation, then use a checksum-pinned wrapper.
gradle --no-daemon -p platforms/android/tools wrapper \
  --gradle-distribution-url "${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL:-https://services.gradle.org/distributions/gradle-8.14.2-bin.zip}" \
  --gradle-distribution-sha256-sum 7197a12f450794931532469d4ff21a59ea2c1cd59a3ec3f89c035c3c420a6999
bash platforms/android/tools/gradlew --no-daemon -p platforms/android assembleDebug
test -s platforms/android/app/build/outputs/apk/debug/app-debug.apk
sha256sum --check "$acode_build_tmp/inputs.sha256"
