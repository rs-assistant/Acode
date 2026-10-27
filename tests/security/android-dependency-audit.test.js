import { describe, expect, it } from "vitest";
import {
	parseAdvisoryPages,
	parseInventory,
} from "../../utils/security/audit-android-dependencies.mjs";

const marker = "ACODE_RUNTIME_DEPENDENCIES=";
const inventory = {
	configuration: "debugRuntimeClasspath",
	modules: [{ group: "org.example", name: "library", version: "1.0.0" }],
};

describe("Android runtime inventory and advisory scanner parsing", () => {
	it("accepts the actual runtime marker while ignoring Gradle warning lines", () => {
		expect(
			parseInventory(`warning\n${marker}${JSON.stringify(inventory)}\n`),
		).toEqual(inventory);
	});
	it.each([
		"",
		marker + "not-json",
		marker + JSON.stringify({ ...inventory, modules: [] }),
		marker +
			JSON.stringify({ ...inventory, configuration: "compileClasspath" }),
		marker +
			JSON.stringify({
				...inventory,
				modules: [{ ...inventory.modules[0], version: "../bad" }],
			}),
		marker + JSON.stringify({ ...inventory, modules: [{ group: "example" }] }),
	])("does not treat malformed/empty inventories as a clean scan: %s", (value) => {
		expect(() => parseInventory(value)).toThrow();
	});
	it("parses all advisory pages including escaped summary newlines", () => {
		const advisory = {
			ghsa_id: "GHSA-dummy",
			vulnerabilities: [],
			summary: "dummy\nsummary",
			severity: "high",
		};
		expect(
			parseAdvisoryPages(
				`${JSON.stringify(advisory)}\n${JSON.stringify(advisory)}\n`,
			),
		).toHaveLength(2);
		expect(parseAdvisoryPages(JSON.stringify(advisory))[0].summary).toBe(
			"dummy\nsummary",
		);
		expect(parseAdvisoryPages("")).toEqual([]);
	});
	it.each([
		"not-json",
		"{}",
		'{"ghsa_id":"GHSA-dummy"}',
	])("rejects malformed advisory output: %s", (value) => {
		expect(() => parseAdvisoryPages(value)).toThrow();
	});
});
