# Closing the remaining npm development-tool findings — 2026-10-27

## Before and after

The previous source had one dependency chain contributing four audit nodes:
`@codemirror/buildhelper@1.0.2` → `@marijn/testtool@0.1.3` → Mocha 10.8.2 →
serialize-javascript 6.0.2 (one high, three propagated/moderate nodes).

The actual linked-client runner now resolves **Mocha 12.0.3** and
**serialize-javascript 7.1.4**. The CodeMirror client submodule remains at
`db6930c2b6db67e14978f08ae8f5aeb149d29468`, with no checkout changes or fork.

After a normal fresh `npm ci --no-audit --no-fund` (lifecycle hooks NOT skipped):

| Command | Findings | Exit |
| --- | --- | --- |
| `npm audit --omit=dev --json` | 0 | 0 |
| `npm audit --json` | 0, including development dependencies | 0 |

These are registry advisory results for the current lockfile, not a complete
embedded-JavaScript/Maven audit or production SSH security approval.

## Reproducible resolution

Simply adding an override previously left the linked client's old nested Mocha
in place. Declaring the buildhelper actually used by this repository as an
explicit **root development dependency** allows its dependency chain to resolve
under the root's scoped `@marijn/testtool` → Mocha `^12.0.3` override. Buildhelper
itself remains 1.0.2; no downgrade or runtime LSP implementation change.

The lockfile records real patched packages/integrities, rather than ignoring an
advisory or editing installed files. A workspace-only trial was also ineffective
and is not retained. No extra root Mocha dependency is necessary. Verification
follows client → helper → runner → Mocha → serializer, not an unrelated top-level
Mocha that might hide an old nested copy. `npm ls mocha serialize-javascript --all`
also succeeds with only the new versions.

Mocha 12 requires Node ^20.19 or >=22.12. The project already uses Node 24 and
newer build tooling; validation used Node 24.19.0 / npm 11.9.0. This does not
claim support for running the current repository's toolchain on old Node 18.

## Compatibility checks

`tests/security/codemirror-toolchain.test.js` runs five checks:

- The linked client's actual helper/runner resolves patched versions; the
  serializer must meet the fix level and the root helper declaration must remain.
- Real `@marijn/testtool.runTests` loads CommonJS and ESM fixtures and runs
  synchronous/asynchronous tests, with a nonzero passing count.
- A separate expected-failure fixture produces exactly one failure, not an empty
  suite or accidentally successful exit. Each case runs in a fresh child process
  so CommonJS module caching cannot suppress test registration.
- Browser-result adapter Suite/Test APIs, browser distribution assets and HTML
  scaffold remain available. This is NOT an actual browser-rendering check.
- Real Mocha CLI parallel workers run three tests through the new serializer.

Fresh install, the client's actual `npm run prepare`, root typecheck, targeted
Biome and diff checks passed. Full Vitest: **99 files / 906 tests passed**.
No existing assertions or tests were removed/weakened. No GitHub Actions success
or Android runtime/Keystore/adversarial security test is inferred from this.

Android Debug build/signature verification also passed (10 seconds, all 62 tasks
up-to-date after rebundling). Packaged min/target/compile SDK remains 26/36/36,
with the same Debug certificate. APK SHA-256 remains
`47af922995e6fd3d121a2fd39352fd777513b1fe900bf6b8122b196b2a9bbcd9`,
byte-identical to the previous locally archived dependency-update build, consistent
with a development-only migration. It is not a new public tablet artifact.

## Remaining scope

The four npm findings are closed for this installed/locked tree, not hidden by
`--omit=dev`. New upstream advisories can change future scan results. The broader
[production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md) remains blocked by
device/adversarial checks and dependency inventory beyond npm. Existing tablet
APK download branches are unchanged; this is a development-tool migration, not
a newly published tablet build or a claim of complete application safety.
