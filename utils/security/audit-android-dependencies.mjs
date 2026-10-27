import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

export function parseInventory(stdout) {
	const line = stdout
		.split("\n")
		.find((value) => value.startsWith("ACODE_RUNTIME_DEPENDENCIES="));
	if (!line) throw new Error("Gradle runtime inventory is missing");
	const inventory = JSON.parse(
		line.slice("ACODE_RUNTIME_DEPENDENCIES=".length),
	);
	if (
		inventory.configuration !== "debugRuntimeClasspath" ||
		!Array.isArray(inventory.modules) ||
		!inventory.modules.length
	)
		throw new Error("Unexpected or empty runtime inventory");
	for (const module of inventory.modules) {
		for (const field of ["group", "name", "version"])
			if (
				typeof module[field] !== "string" ||
				!/^[A-Za-z0-9_.+\-]+$/.test(module[field])
			)
				throw new Error("Invalid Maven coordinate");
	}
	return inventory;
}

export function parseAdvisoryPages(stdout) {
	// gh --paginate applies --jq to each page. @json produces one escaped JSON
	// object per line, including summaries with newlines; empty arrays yield none.
	return stdout
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			const advisory = JSON.parse(line);
			if (
				typeof advisory.ghsa_id !== "string" ||
				!Array.isArray(advisory.vulnerabilities)
			)
				throw new Error("Malformed advisory; scan is not complete");
			return {
				ghsa_id: advisory.ghsa_id,
				cve_id: advisory.cve_id,
				severity: advisory.severity,
				summary: advisory.summary,
				html_url: advisory.html_url,
				vulnerabilities: advisory.vulnerabilities,
			};
		});
}

export async function queryAdvisories(coordinate) {
	const { stdout } = await run(
		"gh",
		[
			"api",
			"--method",
			"GET",
			"/advisories",
			"-f",
			"ecosystem=maven",
			"-f",
			"type=reviewed",
			"-f",
			`affects=${coordinate}`,
			"-f",
			"per_page=100",
			"--paginate",
			"--jq",
			'if type == "array" then .[] | @json else error("Unexpected advisory page") end',
		],
		{ timeout: 30000, maxBuffer: 20 * 1024 * 1024 },
	);
	return parseAdvisoryPages(stdout);
}

async function main() {
	const outputIndex = process.argv.indexOf("--output");
	if (outputIndex < 0 || !process.argv[outputIndex + 1])
		throw new Error("Specify --output <report.json>");
	const inputIndex = process.argv.indexOf("--input");
	const inventory =
		inputIndex >= 0
			? parseInventory(
					"ACODE_RUNTIME_DEPENDENCIES=" +
						(await readFile(process.argv[inputIndex + 1], "utf8")),
				)
			: parseInventory(
					(
						await run(
							"./gradlew",
							[
								"--no-daemon",
								"-q",
								"--init-script",
								path.join(root, "utils/security/android-dependencies.gradle"),
								":app:acodeAuditRuntimeDependencies",
							],
							{
								cwd: path.join(root, "platforms/android"),
								timeout: 180000,
								maxBuffer: 20 * 1024 * 1024,
							},
						)
					).stdout,
				);
	// Positive AND negative controls ensure that a nonempty response is possible
	// and that version filtering is not silently being ignored by the API.
	const vulnerable = await queryAdvisories("commons-io:commons-io@2.11.0");
	const patched = await queryAdvisories("commons-io:commons-io@2.20.0");
	if (
		!vulnerable.some((item) => item.ghsa_id === "GHSA-78wr-2p64-hpwj") ||
		patched.some((item) => item.ghsa_id === "GHSA-78wr-2p64-hpwj")
	)
		throw new Error("Advisory version-filter controls failed");
	const results = new Array(inventory.modules.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: 4 }, async () => {
			while (next < inventory.modules.length) {
				const index = next++;
				const module = inventory.modules[index];
				const coordinate = `${module.group}:${module.name}@${module.version}`;
				results[index] = {
					...module,
					advisories: await queryAdvisories(coordinate),
				};
			}
		}),
	);
	const report = {
		schema_version: 1,
		source_commit: (
			await run("git", ["rev-parse", "HEAD"], { cwd: root })
		).stdout.trim(),
		source_worktree_clean: !(
			await run("git", ["status", "--porcelain"], { cwd: root })
		).stdout.trim(),
		checked_at_utc: new Date().toISOString(),
		configuration: inventory.configuration,
		provider:
			"GitHub global security advisories REST API; published reviewed Maven coverage, not all CVE sources",
		controls_passed: true,
		complete: true,
		module_count: results.length,
		affected_module_count: results.filter((module) => module.advisories.length)
			.length,
		modules: results,
		limitations: [
			"Resolved components include platform/BOM metadata, not independent proof of every packaged class.",
			"Project code and unindexed vendored libraries are not covered by this query.",
			"No OSV/NVD completeness or exploit reachability is claimed. Network/API/parse failure aborts instead of producing a clean report.",
		],
	};
	await writeFile(
		process.argv[outputIndex + 1],
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(
		JSON.stringify(
			{
				module_count: report.module_count,
				affected_module_count: report.affected_module_count,
				findings: results.filter((module) => module.advisories.length),
			},
			null,
			2,
		),
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch(() => {
		console.error(
			"Android advisory scan failed or incomplete; no clean result claimed.",
		);
		process.exitCode = 1;
	});
}
