# Dependency follow-up — 2026-10-27

## Scope and results

Fresh npm scans and targeted bundled-JavaScript review, not a comprehensive
Maven/embedded-library audit or production SSH approval.

| Scan | Before edits | After fresh lockfile install |
| --- | --- | --- |
| `npm audit --omit=dev --json` | 2 low nodes, exit 1 | 0, exit 0 |
| `npm audit --json` | 20 nodes: 12 high / 5 moderate / 3 low, exit 1 | 4 nodes: 1 high / 3 moderate, exit 1 |

Counts include propagated parent nodes, not independent exploitable flaws.
The October 22 totals (11 omit-dev / 30 full) had already become 2 / 20 before
edits today. That advisory-database change is not credited to this patch. An
intermediate scan also reported Happy DOM; its patched major version is used.

## Runtime changes

- KaTeX 0.16.47 → **0.18.10**, Mermaid 11.17.2 → **12.2.0**, addressing
  GHSA-238p-pmpm-9mq7 (existing prototype pollution/inherited trust prerequisite).
  Mermaid's compatible `^0.18.0` range is aligned via `$katex` to the same pin.
- KaTeX 0.18.11 is deprecated upstream as accidentally published with breaking
  changes. Keep direct KaTeX exact-pinned to 0.18.10 rather than accepting that
  version automatically. Future changes to the pin require compatibility review.
- Explicit preview `trust: false`; tests cover ordinary math, HTML/image/link
  commands being refused, inherited trust, strict Mermaid flowchart, sequence,
  class and state parsing. They do not establish real WebView visual rendering.
- The HTTP plugin contained an **embedded Lodash 4.17.1 custom build**, outside
  npm's inventory. Isolated VMs reproduced prototype writes through `set` array
  paths and inherited-property deletion through `unset`. Those three regressions
  now pass with vendored **4.18.1**; nested cookie path/values/removal and the real
  cookie-store adapter's round trip are covered. This is a library-level defect
  reproduction, not proof of a remote HTTP/SSH exploit or its prerequisites.
- Replacement is upstream 4.18.1 `lodash.min.js` with a terminal LF, not a manual
  fix to minified code. Upstream SHA-256:
  `a8d7e6291ad80256f976ace90824a71018d2f706992c9107b20bdced97bee27b`.
  Tracked LF-terminated SHA-256:
  `ca2ee2cc6f102a2adabefe63ae604275a2be6cb6c0d12ec2d43ddca9900dc8d9`.
  MIT/OpenJS attribution is preserved in `www/lodash.LICENSE` and packaged as an
  asset. The full minified library replaces the small custom subset; no identical
  APK size or WebView performance claim is made.

## Development dependencies

- Vitest 4.1.11 → 4.1.12, Vite 8.2.2 → 8.3.5; Happy DOM 20.11.6 → 21.0.4.
- Allowed-range leaves: fast-uri 3.1.2 → 3.1.9, immutable 5.1.5 → 5.1.9,
  js-yaml 4.2.0 → 4.3.2, source-map-js 1.2.1 → 1.2.2, diff 5.0.0 → 5.2.2.
  No Cordova downgrade or Android toolchain migration.
- Vendored advanced-http/buildinfo manifests retained test/release scripts
  pointing at absent upstream tests/scripts and their dev dependencies (old
  Mocha, XML parser, JSHint, etc.). Remove that stale dev-only metadata, not any
  existing product code/test directory, native source or bundled cookie parser.
  Root tests/CI remain intact. Original metadata is recoverable from Git history;
  standalone plugin development requires the upstream test checkout.

## Still open: one development-tool chain

`@codemirror/buildhelper` → `@marijn/testtool` → Mocha 10.8.2 →
serialize-javascript 6.0.2 contributes four nodes (1 high / 3 moderate), including
GHSA-5c6j-r48x-rmvq. Not a preview/SSH runtime library, but still a development
machine risk. Latest testtool still declares Mocha `^10.0.0`.

Trial scoped/global overrides and a direct Mocha 12 installation did not replace
the nested 10.8.2 actually resolved by this linked submodule's runner. An explicit
resolution assertion caught that. Ineffective overrides, extra direct dependency
and temporary smoke fixture are NOT retained. No Mocha 12 migration is claimed.
The submodule pointer and checkout are unchanged. Resolve this with a separate
reproducible upstream/submodule/tool-runner migration, not ignored node_modules
edits or an unsafe buildhelper downgrade.

## Validation and limits

- Fresh `npm ci --ignore-scripts --no-audit --no-fund` passed (not a lifecycle-hook
  validation). Full Vitest **98 files / 901 tests**, typecheck, targeted Biome and
  diff checks passed. No production assertion was weakened. After correcting a
  missing CommonJS exports fixture, the old embedded library failed three real
  security assertions and the replacement passed; the removed tooling trial is
  distinct from this actual defect regression.
- Native 52 + preferences/SFTP failure 79 + real-library crypto 85 = **216
  assertions passed**, still with Android/AndroidX adapters, not real Keystore.
- Android build/signature passed: 13 seconds, 62 tasks (9 executed, 53 up-to-date),
  after reinstalling the changed local HTTP plugin with `--nosave`.
  Packaged min/target/compile SDK 26/36/36 and the existing Debug certificate
  verified. Packaged Lodash contains the exact updated source; the license and
  main.js match build inputs byte-for-byte. Local APK SHA-256:
  `47af922995e6fd3d121a2fd39352fd777513b1fe900bf6b8122b196b2a9bbcd9`
  (45,843,240 bytes). This APK has not been published to a tablet download branch.
- Chromium blank-page attempt timed out after 15 seconds (exit 124) in this
  restricted container. No browser or Android WebView visual success is claimed.
  Math fonts/layout, diagrams and HTTP cookies need tablet acceptance.
- npm does not cover every vendored script; other embedded libraries and resolved
  Maven dependencies still need inventory/review. Old APK download branches are
  unchanged; source fixes are not installed on the tablet automatically.
- Production SSH approval stays [BLOCKED](SSH_PRODUCTION_RELEASE_BLOCKED.md).
