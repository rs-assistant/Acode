# Non-device native and vendored-library follow-up — 2026-10-27

Scope: the configured paid Android Debug runtime graph, its packaged assets and
the actual embedded HTTP cookie stack. No tablet/emulator, real SSH credentials,
Keystore runtime validation or remote GitHub Actions success is claimed.

## Resolved Maven graph, not declarations

`utils/security/android-dependencies.gradle` collects the selected
`debugRuntimeClasspath` module components. This build has **87** coordinates,
including BOM/platform metadata; it is not proof of every class inside the DEX.
Project source and unindexed libraries do not have Maven coordinates here.

```sh
# Run with this repository's Android/JDK environment activated.
node utils/security/audit-android-dependencies.mjs --output /tmp/android-audit.json
```

The scanner queries GitHub's **reviewed Maven advisories**, paginates results,
and checks a known affected Commons IO 2.11.0 and patched 2.20.0 pair before
accepting version filtering. Command/API/JSON errors fail the scan rather than
reporting zero. Always check exit status, complete flag, timestamp and source
state; do not treat the mere presence of an older report as a successful rerun.
Parsing regressions cover missing/empty/wrong-configuration inventories, malformed
coordinates/results and escaped/multiple-page advisory records.

OSV `api.osv.dev` is blocked by the environment proxy (CONNECT 403); the script
does not claim OSV/NVD or all-CVE coverage. GitHub Actions branch-run queries still
returned no runs. No repository Actions permissions were changed.

## Bouncy Castle findings and migration

The initial graph selected BC **1.83**, with two affected coordinates and five
distinct reviewed advisory IDs. These are package/range matches, not five proven
reachable application exploits:

| Module | Advisory IDs |
| --- | --- |
| bcpkix-jdk15to18 | GHSA-wg6q-6289-32hp |
| bcprov-jdk15to18 | GHSA-qp49-qgx5-5m26, GHSA-9pwp-9qqc-pr26, GHSA-c3fc-8qff-9hwx, GHSA-574f-3g2m-x479 |

An aligned 1.85 trial passed JVM key tests but Android rejected a duplicate
`org.bouncycastle.asn1.iana.IANAObjectIdentifiers` in official bcprov/bcutil JARs.
Do NOT describe that trial as a successful build or strip crypto classes to make
it package. Patch releases are not published for all three modules at a common
1.85.x version. Use the aligned official **1.86** bcprov/bcpkix/bcutil set instead;
the duplicate is absent and Android compilation/DEX/package checks pass.

All new harness JARs are SHA-256 pinned and checked against the Maven downloads.
The key harness now also refuses overlapping base classes before running JVM
tests (excluding only module descriptors/multi-release metadata). Its actual
Maverick 3.1.4 + BC 1.86 Ed25519/RSA-4096 tests pass. No Android device key migration
or production-key compatibility claim follows from disposable JVM tests.

The final selected 1.86 graph has **0 affected modules among 87** in this GitHub
advisory query. npm full and omit-dev scans also both exit 0 with zero findings.
Machine-readable runtime inventory/query evidence is retained separately.

Commons IO declarations are raised to the already-resolved 2.20.0, avoiding a
future fallback to vulnerable 2.11.0 if another plugin is removed. NanoHTTPD's
unbounded `+` is pinned to the already-selected 2.3.1. These two changes do not
claim that old Commons IO was actually packaged or that every NanoHTTPD risk is
resolved; they make future dependency resolution more explicit/reproducible.

## Embedded browser cookie stack

The HTTP plugin embedded **tough-cookie 3.0.0**, invisible to npm's package
inventory. GHSA-72xf-g2v4-qvf3 affects versions below 4.1.3. A disposable VM using
the old actual bundle reproduced default memory-store prototype mutation; the
new actual bundle does not. The application normally supplies its own storage
adapter (already using patched Lodash), so this is not proof of a remotely
reachable attack through the app's default HTTP flow.

- Rebuild from exact-pinned **tough-cookie 4.1.4**, a compatible maintenance line
  without a current matching reviewed advisory, using `npm run build:http-cookie`.
  Do not manually patch the generated minified distribution.
- The browser-only util adapter implements the upstream "Node util unavailable"
  behavior without mistaking an empty polyfill for a working util. No Node require,
  process or Buffer globals are needed by the generated distribution.
- Package the full upstream notices for tough-cookie, psl, punycode, universalify,
  url-parse, querystringify and requires-port. Fresh locked builds reproduced the
  distribution and combined license byte-for-byte.
- Adapt the custom store to the upstream Store class and four-argument
  findCookies API; retain old callbacks, add removeAllCookies, refuse inherited
  domain/path/key lookups and handle invalid cookie caches. This does not touch
  SSH credential/profile storage or add a plaintext credential fallback.
- Actual browser-bundle/adapter/handler tests cover persistence/reopening,
  replacement/removal, domain/path/Secure/expiry restrictions, public suffixes,
  response Expires commas, malformed cookies, localhost, and prototype protection.
  IDN checks use a Unicode URL with a valid ASCII IDNA Domain attribute. A first
  fixture assumed raw non-ASCII Domain support; the upstream memory store also
  did not support that case, so the fixture was corrected, not a security assertion
  weakened or a new unsupported cookie feature promised.
- CI now pins Node 24 and rebuilds/compares the tracked distribution/license in
  the unit-test job; local reproduction was executed, remote CI is not verified.

## Local validation and packaging

- Normal fresh npm ci passed. Full Vitest: **101 files / 931 tests passed**;
  typecheck, targeted Biome, authored utility formatting, shell syntax and diff
  checks pass. Tests execute the actual browser distribution in isolated VMs,
  not an Android WebView or a real network HTTP exchange.
- Native core 52 + preferences/SFTP failure 79 + real-library crypto 85 = **216
  assertions passed**; the storage adapters are still not real Android Keystore.
- A local plugin reinstall briefly overlapped npm ci and saw a missing installed
  module; repeating serially after installation restored the complete plugin set.
  That transient failure is not an application fix or a skipped validation.
- BC 1.85 Android trial failed duplicate-class checking. Final BC 1.86 build
  passed in **40 seconds**, 62 tasks (13 executed / 49 up-to-date), including the
  duplicate check, Java compilation, DEX processing, APK package and signature.
- APK min/target/compile SDK 26/36/36, original Debug certificate, backup=false,
  all 18 extraction exclusions verified. Cleartext remains true for the existing
  localhost preview/terminal design; no network-policy redesign is claimed.
- Packaged cookie/Lodash/adapter source, both license assets and main.js match
  build inputs. Local APK SHA-256:
  `0841f4706c4321e93d48a398bb14b9dfaff60ca93148edccdd6b1bc0fca91e7f`
  (47,258,097 bytes). No new tablet download was published; main and prior APK
  branches remain unchanged.

## Still not complete

OSV/NVD cross-checking, a complete inventory of every embedded/binary dependency,
independent patch review and remote CI remain unverified. Real WebView/cookie,
Keystore/key-upgrade, hostile-plugin and SSH/SFTP device acceptance remain in the
[production release gate](SSH_PRODUCTION_RELEASE_BLOCKED.md). Passing these local
checks is not approval to use production SSH credentials.
