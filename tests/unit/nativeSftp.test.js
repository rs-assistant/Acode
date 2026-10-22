import { afterEach, describe, expect, it, vi } from "vitest";

const { getSftpCapability } = vi.hoisted(() => ({
	getSftpCapability: vi.fn(),
}));

vi.mock("lib/pluginContext", () => ({ getSftpCapability }));

afterEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
	getSftpCapability.mockReset();
});

describe("private native SFTP bridge", () => {
	it("prepends the app-only capability to native calls", async () => {
		const nativeExec = vi.fn();
		getSftpCapability.mockResolvedValue("app-capability");
		vi.stubGlobal("cordova", { require: vi.fn(() => nativeExec) });

		const { default: nativeSftp } = await import("lib/nativeSftp");
		const onSuccess = vi.fn();
		const onFail = vi.fn();

		nativeSftp.getFile("remote.txt", "local.txt", onSuccess, onFail);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(nativeExec).toHaveBeenCalledWith(
			onSuccess,
			onFail,
			"Sftp",
			"getFile",
			["app-capability", "remote.txt", "local.txt"],
		);
	});

	it("fails closed when the trusted session cannot issue a capability", async () => {
		const nativeExec = vi.fn();
		getSftpCapability.mockRejectedValue(new Error("session unavailable"));
		vi.stubGlobal("cordova", { require: vi.fn(() => nativeExec) });

		const { default: nativeSftp } = await import("lib/nativeSftp");
		const onFail = vi.fn();
		nativeSftp.connectUsingProfile("profile-1", vi.fn(), onFail);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(nativeExec).not.toHaveBeenCalled();
		expect(onFail).toHaveBeenCalledWith("session unavailable");
	});
});
