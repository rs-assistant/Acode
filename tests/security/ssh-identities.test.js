// @vitest-environment happy-dom
import tag from "html-tag-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSourceModule } from "../helpers/loadSourceModule";

const metadata = {
	keyId: "identity-11111111-1111-1111-1111-111111111111",
	label: "test identity",
	algorithm: "ed25519",
	publicKey: "ssh-ed25519 AAAA acode",
	fingerprint: `SHA256:${"A".repeat(43)}`,
};
function setupLib(items = [metadata]) {
	const bridge = {
		listSshKeys: vi.fn((success) => success(items)),
		generateSshKey: vi.fn((_label, _algorithm, success) =>
			success({ ...metadata, privateKey: "dummy-secret-must-not-retain" }),
		),
		deleteSshKey: vi.fn((_id, success) => success(0)),
	};
	return {
		bridge,
		module: loadSourceModule("src/lib/sshIdentities.js", {
			"./nativeSftp": bridge,
		}),
	};
}
afterEach(() => document.body.replaceChildren());

describe("SSH identity metadata boundary", () => {
	it("returns only a frozen public allowlist, even if a future native result adds fields", async () => {
		const { module } = setupLib([
			{
				...metadata,
				privateKey: "dummy-secret",
				passphrase: "dummy-passphrase",
			},
		]);
		const [item] = await module.listSshIdentities();
		expect(item).toEqual(metadata);
		expect(Object.isFrozen(item)).toBe(true);
		expect(JSON.stringify(item)).not.toContain("dummy-secret");
	});
	it.each([
		null,
		{ ...metadata, keyId: "../acode_sftp_profiles_v1" },
		{ ...metadata, publicKey: "-----BEGIN PRIVATE KEY-----" },
		{ ...metadata, publicKey: "ssh-ed25519 AAAA\nextra" },
		{ ...metadata, algorithm: "dsa" },
		{ ...metadata, fingerprint: "MD5:invalid" },
	])("rejects malformed public identity %j", (value) => {
		expect(() => setupLib().module.publicIdentity(value)).toThrow();
	});
	it.each([
		"",
		"bad\nlabel",
		"x".repeat(81),
		null,
	])("rejects invalid key labels before crossing the bridge: %j", async (label) => {
		const { module, bridge } = setupLib();
		await expect(module.generateSshIdentity(label)).rejects.toThrow();
		expect(bridge.generateSshKey).not.toHaveBeenCalled();
	});
	it("accepts only the supported generation algorithms and does not send secret output back to UI", async () => {
		const { module, bridge } = setupLib();
		await expect(
			module.generateSshIdentity("dummy", "rsa1024"),
		).rejects.toThrow();
		expect(
			await module.generateSshIdentity(" test identity ", "ed25519"),
		).toEqual(metadata);
		expect(bridge.generateSshKey.mock.calls[0].slice(0, 2)).toEqual([
			"test identity",
			"ed25519",
		]);
	});
});

function setupPage(items = [metadata]) {
	const { module, bridge } = setupLib(items);
	const page = document.createElement("section");
	page.hide = vi.fn(() => page.onhide());
	const app = document.createElement("div");
	document.body.append(app);
	const copy = vi.fn((_text, success) => success());
	const toast = vi.fn();
	const error = vi.fn();
	const select = vi.fn(async () => "ed25519");
	const prompt = vi.fn(async () => ({ label: "test identity" }));
	const actionStack = { push: vi.fn(), remove: vi.fn() };
	const strings = new Proxy({}, { get: (_target, key) => String(key) });
	const { default: show } = loadSourceModule(
		"src/pages/sshKeys/index.js",
		{
			"components/page": () => page,
			"dialogs/multiPrompt": prompt,
			"dialogs/select": select,
			"lib/actionStack": actionStack,
			"lib/sshIdentities": module,
			"utils/helpers": { error },
		},
		{ app, tag, strings, toast, cordova: { plugins: { clipboard: { copy } } } },
	);
	return {
		show,
		page,
		copy,
		toast,
		error,
		bridge,
		select,
		prompt,
		actionStack,
	};
}

describe("real-source key management page", () => {
	it("renders labels as text and copies only the public key", async () => {
		const fixture = setupPage([
			{ ...metadata, label: '<img src=x onerror="dummy()">' },
		]);
		await fixture.show();
		expect(fixture.page.querySelector("h3").textContent).toContain("<img");
		expect(fixture.page.querySelector("img")).toBeNull();
		expect(fixture.page.querySelector("textarea").readOnly).toBe(true);
		await [...fixture.page.querySelectorAll("button")]
			.find((node) => node.textContent === "copy public key")
			.onclick();
		expect(fixture.copy.mock.calls[0][0]).toBe(metadata.publicKey);
		expect(fixture.toast).toHaveBeenCalledWith("public key copied");
	});
	it("prevents duplicate generation while the choice dialog is open", async () => {
		const fixture = setupPage([]);
		await fixture.show();
		let choose;
		fixture.select.mockImplementation(
			() =>
				new Promise((resolve) => {
					choose = resolve;
				}),
		);
		const button = fixture.page.querySelector("button");
		const pending = button.onclick();
		await button.onclick();
		expect(fixture.select).toHaveBeenCalledTimes(1);
		choose("ed25519");
		await pending;
		expect(fixture.bridge.generateSshKey).toHaveBeenCalledTimes(1);
		expect(button.disabled).toBe(false);
		expect(fixture.error).not.toHaveBeenCalled();
	});
	it("native cancellation preserves a key and does not refresh/delete the visible entry", async () => {
		const fixture = setupPage();
		await fixture.show();
		await [...fixture.page.querySelectorAll("button")]
			.find((node) => node.textContent === "delete ssh key")
			.onclick();
		expect(fixture.bridge.deleteSshKey.mock.calls[0][0]).toBe(metadata.keyId);
		expect(fixture.bridge.listSshKeys).toHaveBeenCalledTimes(1);
		expect(fixture.page.querySelectorAll("textarea")).toHaveLength(1);
	});
	it("does not start generation after the page has closed", async () => {
		const fixture = setupPage();
		await fixture.show();
		fixture.page.onhide();
		await fixture.page.querySelector("button").onclick();
		expect(fixture.select).not.toHaveBeenCalled();
		expect(fixture.actionStack.remove).toHaveBeenCalledWith(
			fixture.actionStack.push.mock.calls[0][0].id,
		);
	});
});
