import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// Follow the actual linked client's dependency chain, not an unrelated top-level
// Mocha install that can leave the runner using its old nested copy.
const clientRequire = createRequire(
	path.resolve("codemirror-lsp-client/package.json"),
);
const helperRequire = createRequire(
	clientRequire.resolve("@codemirror/buildhelper/package.json"),
);
const runnerPath = helperRequire.resolve("@marijn/testtool");
const runnerRequire = createRequire(runnerPath);
const mochaPath = runnerRequire.resolve("mocha");
const mochaRequire = createRequire(mochaPath);
const temporary = [];

afterEach(() => {
	for (const root of temporary.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), "acode-cm-toolchain-"));
	temporary.push(root);
	const commonjs = path.join(root, "test-commonjs.cjs");
	writeFileSync(
		commonjs,
		`const assert = require("node:assert/strict");
		describe("commonjs", () => {
			it("sync passes", () => assert.equal(2 + 2, 4));
			it("async passes", async () => assert.equal(await Promise.resolve(7), 7));
			it("expected failure", () => assert.equal(1, 2));
		});`,
	);
	const esm = path.join(root, "test-esm.mjs");
	writeFileSync(
		esm,
		`import assert from "node:assert/strict";
		describe("esm", () => it("module passes", () => assert.equal(3 + 3, 6)));`,
	);
	return { root, commonjs, esm };
}

describe("patched CodeMirror development-tool dependency chain", () => {
	it("resolves patched versions through the linked client's actual helper/runner", () => {
		const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
		expect(rootPackage.devDependencies["@codemirror/buildhelper"]).toBeTruthy();
		expect(clientRequire.resolve("@codemirror/buildhelper/package.json")).toBe(
			require.resolve("@codemirror/buildhelper/package.json"),
		);
		expect(runnerRequire("mocha/package.json").version).toMatch(/^12\./);
		const [major, minor, patch] = mochaRequire(
			"serialize-javascript/package.json",
		)
			.version.split(".")
			.map(Number);
		expect(
			major > 7 || (major === 7 && (minor > 1 || (minor === 1 && patch >= 3))),
		).toBe(true);
	});

	it.each([
		["passes", 0, 3],
		["expected failure", 1, 0],
	])("runs the real testtool with correct results for %s", (grep, failures, passes) => {
		const { commonjs, esm } = fixture();
		// Fresh processes avoid CommonJS's module cache suppressing registration
		// on a second run. The expected-failure case must not become a zero-test pass.
		const output = execFileSync(
			process.execPath,
			[
				"-e",
				`
			const tool = require(${JSON.stringify(runnerPath)});
			tool.runTests({tests: ${JSON.stringify([commonjs, esm])}, grep: ${JSON.stringify(grep)}, browsers: []})
				.then(count => {
					if (count !== ${failures}) throw Error("Failure count mismatch");
					console.log("RUNNER_COMPLETE");
				}).catch(error => { console.error(error); process.exitCode = 1; });
		`,
			],
			{ encoding: "utf8", timeout: 15000 },
		);
		expect(output).toContain("RUNNER_COMPLETE");
		expect(output).toContain(`${passes} passing`);
		if (failures) expect(output).toContain(`${failures} failing`);
	});

	it("retains browser-result adapter APIs and browser distribution assets", () => {
		const Mocha = runnerRequire("mocha");
		const suite = Mocha.Suite.create(
			new Mocha.Suite("fixture"),
			"browser result",
		);
		suite.addTest(new Mocha.Test("dummy browser result", () => {}));
		expect(suite.tests).toHaveLength(1);
		const browserBundle = readFileSync(
			runnerRequire.resolve("mocha/mocha.js"),
			"utf8",
		);
		expect(browserBundle).toContain("mocha");
		expect(
			readFileSync(runnerRequire.resolve("mocha/mocha.css"), "utf8"),
		).toContain("#mocha");
		expect(runnerRequire("@marijn/testtool").testHTML([])).toContain(
			"mocha.setup",
		);
	});

	it("runs parallel workers through Mocha's actual serialization path", () => {
		const { commonjs, esm } = fixture();
		const cli = path.join(
			path.dirname(runnerRequire.resolve("mocha/package.json")),
			"bin/mocha.js",
		);
		const output = execFileSync(
			process.execPath,
			[
				cli,
				"--no-config",
				"--no-package",
				"--parallel",
				"--jobs",
				"2",
				"--grep",
				"passes",
				"--reporter",
				"json",
				commonjs,
				esm,
			],
			{ encoding: "utf8", timeout: 15000 },
		);
		const result = JSON.parse(output);
		expect(result.stats.tests).toBe(3);
		expect(result.stats.passes).toBe(3);
		expect(result.stats.failures).toBe(0);
	});
});
