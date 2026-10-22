import { afterEach, describe, expect, it, vi } from "vitest";
import { createCordovaAuditBridge } from "./fixtures/cordovaAuditBridge";

vi.mock("lib/ajax", () => ({ default: {} }));
vi.mock("lib/settings", () => ({
	default: { value: { retryRemoteFsAfterFail: false } },
}));
vi.mock("utils/encodings", () => ({
	encode: async (value) => value,
	decode: async (value) => value,
}));
vi.mock("utils/helpers", () => ({
	default: {
		defineDeprecatedProperty() {},
	},
}));
vi.mock("fileSystem/internalFs", () => ({
	default: { test: () => false },
}));
vi.mock("fileSystem/externalFs", () => ({
	default: { test: () => false },
}));
vi.mock("fileSystem/ftp", () => ({ default: { test: () => false } }));

afterEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
});

// Characterization of CURRENT VULNERABILITIES, not assertions that the app is
// secure. A passing exploit case means the audited path is still exploitable
// against a dummy native transport. No Android/SSH runtime is exercised here.
describe("tablet build: same-realm SSH boundary audit", () => {
	it("control: the dummy native gate rejects a direct call without a capability", async () => {
		const bridge = createCordovaAuditBridge();
		await expect(bridge.invoke("Sftp", "stat", ["/dummy.txt"])).rejects.toBe(
			"SFTP authorization required",
		);
	});

	it("VULNERABILITY: a plugin-facing fs wrapper reuses an active SFTP session", async () => {
		const bridge = createCordovaAuditBridge({ connected: "profile-dummy" });
		vi.stubGlobal("cordova", bridge.cordova);
		const { default: fsOperation } = await import("fileSystem");
		const { connect } = await import("lib/pluginContext");
		await connect(); // App boot finishes before the plugin runs.

		// acode.require('fs') exposes this exact fsOperation function. Its
		// registration in acode.js is also covered by the audit report.
		expect(globalThis.sftp).toBeUndefined();
		await expect(
			fsOperation("sftp://profile-dummy/dummy.txt").stat(),
		).resolves.toMatchObject({ exists: true });
		expect(bridge.calls).toContainEqual({
			service: "Sftp",
			action: "stat",
			args: ["dummy-audit-capability", "/dummy.txt"],
		});
		expect(
			bridge.calls.some((call) => call.action === "connectUsingProfile"),
		).toBe(false);
	});

	it("VULNERABILITY: the same fs wrapper can authenticate with a saved profile", async () => {
		const bridge = createCordovaAuditBridge();
		vi.stubGlobal("cordova", bridge.cordova);
		const { default: fsOperation } = await import("fileSystem");
		const { connect } = await import("lib/pluginContext");
		await connect();

		await expect(
			fsOperation("sftp://profile-dummy/dummy.txt").stat(),
		).resolves.toMatchObject({ exists: true });
		expect(bridge.calls).toContainEqual({
			service: "Sftp",
			action: "connectUsingProfile",
			args: ["dummy-audit-capability", "profile-dummy"],
		});
	});

	it.each([
		false,
		true,
	])("VULNERABILITY: Cordova's provider reveals wire capabilities (cached=%s)", async (cached) => {
		const bridge = createCordovaAuditBridge();
		vi.stubGlobal("cordova", bridge.cordova);
		const { connect } = await import("lib/pluginContext");
		const { default: nativeSftp } = await import("lib/nativeSftp");
		await connect(); // The plugin does not race initial session establishment.
		if (cached) {
			await new Promise((resolve, reject) =>
				nativeSftp.isConnected(resolve, reject),
			);
		}

		const provider = cordova.require("cordova/android/nativeapiprovider");
		const original = provider.get();
		const intercepted = [];
		provider.set({
			exec(...args) {
				intercepted.push({
					service: args[1],
					action: args[2],
					args: JSON.parse(args[4]),
				});
				return original.exec(...args);
			},
			retrieveJsMessages: (...args) => original.retrieveJsMessages(...args),
			setNativeToJsBridgeMode: (...args) =>
				original.setNativeToJsBridgeMode(...args),
		});
		expect(Object.getOwnPropertyDescriptor(cordova, "exec").writable).toBe(
			false,
		);
		await new Promise((resolve, reject) =>
			nativeSftp.isConnected(resolve, reject),
		);
		const secretRequest = intercepted.find(
			(call) => call.action === "requestSftpCapability",
		);
		const sftpRequest = intercepted.find((call) => call.service === "Sftp");
		if (cached) expect(secretRequest).toBeUndefined();
		else expect(secretRequest.args).toEqual(["dummy-audit-session"]);
		expect(sftpRequest.args).toEqual(["dummy-audit-capability"]);
		await expect(
			bridge.invoke("Sftp", "exec", [
				sftpRequest.args[0],
				"printf dummy-audit",
			]),
		).resolves.toBe("dummy command output");
	});
});
