import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const workflow = require("js-yaml").load(
	readFileSync(".github/workflows/manual-test-apk.yml", "utf8"),
);
const build = workflow.jobs.build;
const deliver = workflow.jobs.deliver;
const upload = deliver.steps.find((step) => step.env?.GH_TOKEN);
const restore = deliver.steps.find((step) => step.id === "restore_signer");
const temporary = [];
afterEach(() => {
	for (const directory of temporary.splice(0))
		rmSync(directory, { recursive: true });
});

function fixture() {
	const directory = mkdtempSync(join(tmpdir(), "acode-release-regression-"));
	temporary.push(directory);
	mkdirSync(join(directory, "bin"));
	mkdirSync(join(directory, "delivery"));
	const sha = "a".repeat(40);
	const apk = `acode-tablet-${sha}.apk`;
	writeFileSync(join(directory, "delivery", apk), "dummy APK, not installable");
	const digest = createHash("sha256")
		.update("dummy APK, not installable")
		.digest("hex");
	writeFileSync(join(directory, "delivery/SHA256SUMS"), `${digest}  ${apk}\n`);
	for (const name of [
		"README.md",
		"signature.txt",
		"package.txt",
		"provenance.json",
	]) {
		writeFileSync(join(directory, "delivery", name), "dummy test metadata");
	}
	writeFileSync(
		join(directory, "bin/gh"),
		`#!/usr/bin/env node\nrequire('node:fs').writeFileSync('gh-args.json', JSON.stringify(process.argv.slice(2)));\n`,
		{ mode: 0o700 },
	);
	return {
		directory,
		env: {
			...process.env,
			PATH: `${join(directory, "bin")}:${process.env.PATH}`,
			RUNNER_TEMP: directory,
			GITHUB_SHA: sha,
			GITHUB_RUN_ID: "1234",
			GITHUB_RUN_ATTEMPT: "2",
			GITHUB_REPOSITORY: "rs-assistant/Acode",
			GITHUB_STEP_SUMMARY: join(directory, "summary.md"),
			GH_TOKEN: "dummy-not-a-real-token",
			ACODE_DEBUG_KEYSTORE_BASE64: "",
		},
	};
}

function shell(script, data) {
	return spawnSync("bash", ["-e", "-o", "pipefail"], {
		input: script,
		cwd: data.directory,
		env: data.env,
		encoding: "utf8",
		timeout: 5000,
	});
}

describe("manual APK workflow boundaries", () => {
	it("is manual-only, requires the selected security branch and defaults to no release", () => {
		expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
		expect(workflow.on.workflow_dispatch.inputs.upload_release.default).toBe(
			false,
		);
		expect(build.if).toContain("github.repository == 'rs-assistant/Acode'");
		expect(build.if).toContain(
			"github.ref == 'refs/heads/security/ssh-native-hardening'",
		);
		expect(build.if).toContain("github.event_name == 'workflow_dispatch'");
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
	});
	it("pins all actions and checks out only the dispatched source without persisted credentials", () => {
		for (const job of [build, deliver]) {
			for (const step of job.steps.filter((value) => value.uses)) {
				expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
			}
		}
		const checkout = build.steps.find((step) =>
			step.uses?.startsWith("actions/checkout@"),
		);
		expect(checkout.with).toEqual({
			ref: "${{ github.sha }}",
			submodules: "recursive",
			"persist-credentials": false,
		});
	});
	it("keeps both persistent secrets out of source/dependency/build execution", () => {
		expect(JSON.stringify(build)).not.toContain("secrets.");
		expect(JSON.stringify(deliver)).not.toContain("actions/checkout@");
		expect(JSON.stringify(deliver)).not.toMatch(/npm |gradlew|utils\/ci/);
		const uses = deliver.steps.filter((step) =>
			JSON.stringify(step).includes("secrets.ACODE_RELEASE_TOKEN"),
		);
		expect(uses).toEqual([upload]);
		expect(upload.if).toBe("inputs.upload_release");
		expect(deliver.steps.find((step) => step.if === "always()").run).toBe(
			'rm -f -- "$RUNNER_TEMP/acode-debug.keystore"',
		);
	});
	it("requires the original signer and verifies package, SDK and final artifact", () => {
		expect(deliver.env.ACODE_EXPECTED_SIGNER_SHA256).toBe(
			"c6a811233830332c03851f95b3487faa7e4bde3b93f854b9cf4d8cb2a7969351",
		);
		const sign = deliver.steps.find((step) => step.id === "sign").run;
		for (const check of [
			'apksigner" verify',
			"zipalign",
			"com.foxdebug.acode",
			"sdkVersion:'26'",
			"targetSdkVersion:'36'",
			"productionApproved: false",
		]) {
			expect(sign).toContain(check);
		}
		expect(restore.run).not.toContain("-genkeypair");
	});
	it("parses all shell blocks and refuses an existing Android project", () => {
		for (const job of [build, deliver]) {
			for (const step of job.steps.filter((value) => value.run)) {
				execFileSync("bash", ["-n"], { input: step.run });
			}
		}
		const data = fixture();
		mkdirSync(join(data.directory, "platforms/android"), { recursive: true });
		const result = shell(
			readFileSync("utils/ci/build-test-apk.sh", "utf8"),
			data,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("fresh disposable checkout");
	});
	it("refuses missing signing material before invoking Android tools", () => {
		const result = shell(restore.run, fixture());
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("Missing ACODE_DEBUG_KEYSTORE_BASE64");
	});
	it("refuses a different signer rather than producing an incompatible update", () => {
		const data = fixture();
		data.env.ACODE_DEBUG_KEYSTORE_BASE64 =
			Buffer.from("dummy key").toString("base64");
		data.env.ACODE_EXPECTED_SIGNER_SHA256 =
			deliver.env.ACODE_EXPECTED_SIGNER_SHA256;
		writeFileSync(
			join(data.directory, "bin/keytool"),
			"#!/bin/sh\nprintf wrong-certificate\n",
			{ mode: 0o700 },
		);
		const result = shell(restore.run, data);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("Wrong signing certificate");
	});
	it("creates only a fresh draft targeting the exact SHA (mock API, dummy files)", () => {
		const data = fixture();
		const result = shell(upload.run, data);
		expect(result.status, result.stderr).toBe(0);
		const args = JSON.parse(
			readFileSync(join(data.directory, "gh-args.json"), "utf8"),
		);
		expect(args.slice(0, 3)).toEqual([
			"release",
			"create",
			"tablet-test-1234-2",
		]);
		for (const flag of ["--draft", "--prerelease", "--latest=false"])
			expect(args).toContain(flag);
		expect(args[args.indexOf("--target") + 1]).toBe(data.env.GITHUB_SHA);
		expect(args[args.indexOf("--repo") + 1]).toBe("rs-assistant/Acode");
		expect(args).not.toContain("--clobber");
		expect(args.join(" ")).not.toContain(data.env.GH_TOKEN);
	});
	it("refuses a missing release token without attempting an API call", () => {
		const data = fixture();
		data.env.GH_TOKEN = "";
		expect(shell(upload.run, data).status).toBe(1);
		expect(existsSync(join(data.directory, "gh-args.json"))).toBe(false);
	});
	it("refuses changed APK bytes before attempting upload", () => {
		const data = fixture();
		writeFileSync(
			join(
				data.directory,
				"delivery",
				`acode-tablet-${data.env.GITHUB_SHA}.apk`,
			),
			"tampered",
		);
		expect(shell(upload.run, data).status).not.toBe(0);
		expect(existsSync(join(data.directory, "gh-args.json"))).toBe(false);
	});
});
