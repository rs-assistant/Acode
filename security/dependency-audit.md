# Dependency audit — 2026-10-22

Scope: this hardening branch, npm lockfile and a targeted Android dependency
resolution check. This is not a complete Maven/CVE audit or a security approval.

## Updates

- Bundled preview libraries: DOMPurify 3.4.14 → 3.4.17, markdown-it 14.3.0 →
  14.3.3, Mermaid 11.15.0 → 11.17.2. This addresses the reported DOMPurify
  IN_PLACE issues, markdown parsing DoS, and Mermaid prototype-pollution/CSS/DoS
  advisories; it does not remove Mermaid's transitive KaTeX finding.
- Refresh allowed-range toolchain leaves in the lockfile: xmldom 0.9.12,
  brace-expansion 5.0.12 (and nested 1.1.21), http-cache-semantics 4.3.0,
  ip-address 10.7.4, pacote 21.5.1, postcss-selector-parser 7.1.7, sigstore 4.1.1,
  systeminformation 5.33.16 and undici 6.29.1. No Cordova downgrade, forced
  major-version change or dependency override was applied.
- Add jsdom 30.1.3 as a development-only test environment for sanitizer/preview
  regressions. Happy DOM's NodeIterator was demonstrated to stop before the next
  sibling when the current node is removed; that mock DOM cannot validate this
  mutation-heavy sanitizer traversal. Chromium startup/dump attempts timed out
  in this container, so no real-browser success is claimed.
- Tests cover active HTML/URL removal using the preview sanitizer options,
  headings, links, tasks, code fences, math and strict Mermaid parsing. They
  do not replace Android WebView or full diagram rendering tests.

## npm findings still open

Commands: `npm audit --omit=dev --json` and `npm audit --json`. Both exited 1
because findings remain; this is not a claim of a clean dependency scan.
Counts are affected dependency **nodes**, including propagated parent findings,
not independent vulnerabilities or proven reachable APK exploits.

- Before updates, omit-dev scan: 22 nodes (18 high, 2 moderate, 2 low).
- Final omit-dev scan: 11 nodes (9 high, 2 low; no moderate/critical).
- Final full scan including development tools: 30 nodes (22 high, 5 moderate,
  3 low; no critical).

The remaining omit-dev high nodes are braces, micromatch, fast-glob, globby,
cordova-common, cordova-fetch, cordova-create, cordova-lib and cordova. Cordova is
declared under `dependencies` but is a build/CLI tool, not a WebView runtime
library. Its chain is still a build-machine risk and is **not** dismissed.
The braces advisory is GHSA-vfj7-8cjw-p6xm; npm's proposed forced Cordova 13 → 9
downgrade is not a safe fix. Upstream replacement/compatibility work is pending.

The remaining low runtime nodes are KaTeX 0.16.47 and Mermaid via KaTeX
(GHSA-238p-pmpm-9mq7: existing prototype pollution can bypass trust restrictions).
The reported fix requires a version outside the current KaTeX compatibility
range; Mermaid 12.x is also outside this change's same-major upgrade. A reviewed
math/diagram migration with visual/device checks is pending, not silently forced.
Do not preview untrusted math/diagram documents while that risk is unresolved.

The full development scan additionally flags build/test chains including
cordova-android, Vite/Vitest, jshint/Mocha and their dependencies. Those findings
need separate compatibility work; passing application tests does not clear them.

## Android dependency spot-check

The SFTP plugin declares commons-io 2.11.0, for which GitHub advisory
GHSA-78wr-2p64-hpwj / CVE-2024-47554 lists affected versions 2.0–<2.14.0.
Gradle `:app:dependencyInsight --dependency commons-io --configuration
debugRuntimeClasspath` actually resolves **2.20.0**, pulled by commons-net 3.12.0.
Thus the vulnerable declaration is not the resolved dependency for this build;
do not report that advisory as a confirmed APK finding. Keep checking resolved
versions after plugin changes. Other Maven dependencies were not comprehensively
scanned, and this spot-check does not prove absence of Java vulnerabilities.

## Validation and residual release gate

The lockfile was accepted by a fresh `npm ci --ignore-scripts --no-audit --no-fund`.
That intentionally omits lifecycle hooks; it is not a test of every install hook.
An existing folding test failed in full runs but passed in isolation: it mocked
`forceParsing` completion without providing the completed tree and depended on
the real initial parse time budget. Its fixture now explicitly supplies the
parsed tree; production folding code and assertion strength are unchanged.

Final full suite: 95 files, 844 tests passed. Typecheck and native harness
(34 Tee + 11 safe-error assertions) passed. Debug APK build/signature passed.
Production credential release remains [BLOCKED](SSH_PRODUCTION_RELEASE_BLOCKED.md)
pending device/upgrade tests and residual risk review. No new APK was published.
