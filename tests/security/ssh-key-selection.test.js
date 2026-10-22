import { describe, expect, it, vi } from "vitest";
import { loadSourceModule } from "../helpers/loadSourceModule";

const identity = {
	keyId: "identity-11111111-1111-1111-1111-111111111111",
	label: "dummy key",
	algorithm: "ed25519",
	fingerprint: "SHA256:dummy",
};

function setup({ keys = [identity], failList = false } = {}) {
	let fields;
	const select = vi.fn(async () => identity.keyId);
	const error = vi.fn();
	const edit = vi.fn(async () => ({
		profileId: "profile-dummy",
		hostname: "dummy.example",
		username: "dummy",
		port: 22,
		authType: "identity",
		identityId: identity.keyId,
	}));
	const prompt = vi.fn(async (_title, inputs) => {
		const all = inputs
			.flat()
			.filter((input) => input && typeof input === "object");
		fields = Object.fromEntries(
			all.map((input) => [input.id, { ...input, value: input.value || "" }]),
		);
		// Simulate switching from password/file inputs to a generated identity.
		fields.password.value = "dummy-password";
		fields.keyFile.value = "content://dummy-private-key";
		fields.passPhrase.value = "dummy-passphrase";
		const body = { get: (selector) => fields[selector.slice(1)] };
		fields.useIdentity.onchange.call({
			checked: true,
			prompt: { $body: body },
		});
		if (keys.length)
			await fields.identityDisplay.onclick.call(fields.identityDisplay);
		return {
			alias: "dummy",
			hostname: "dummy.example",
			username: "dummy",
			port: 22,
			usePassword: false,
			useIdentity: true,
			password: fields.password.value,
			keyFile: fields.keyFile.value,
			passPhrase: fields.passPhrase.value,
		};
	});
	const { default: remote } = loadSourceModule(
		"src/lib/remoteStorage.js",
		{
			"fileSystem/ftp": {},
			"fileSystem/sftp": () => ({ testConnection: async () => "/" }),
			"dialogs/loader": { create: vi.fn(), destroy: vi.fn() },
			"dialogs/multiPrompt": prompt,
			"dialogs/select": select,
			"./sshIdentities": {
				listSshIdentities: async () => {
					if (failList) throw new Error("dummy native vault error");
					return keys;
				},
			},
			"url-parse": {},
			"utils/helpers": {
				uuid: () => "dummy",
				error,
				canShowAds: () => false,
				showInterstitialIfReady: async () => {},
			},
			"utils/Url": {},
			"./sftpProfiles": {
				createSftpProfileUrl: () => "sftp://profile-dummy/",
				editSftpProfile: edit,
			},
			"./startAd": {},
		},
		{ strings: new Proxy({}, { get: (_target, key) => String(key) }) },
	);
	return { remote, error, edit, getFields: () => fields, prompt };
}

describe("stored-key connection selection in the actual SFTP form", () => {
	it("passes only the selected identity ID after clearing file/password form fields", async () => {
		const f = setup();
		const result = await f.remote.addSftp({
			hostname: "dummy.example",
			username: "dummy",
		});
		expect(result.url).toBe("sftp://profile-dummy/");
		expect(f.edit).toHaveBeenCalledWith(
			expect.objectContaining({
				authType: "identity",
				identityId: identity.keyId,
				password: "",
				keyFile: "",
				passPhrase: "",
			}),
		);
		expect(f.getFields().identityDisplay.value).toBe(identity.label);
		expect(f.getFields().password.hidden).toBe(true);
		expect(f.getFields().keyFile.hidden).toBe(true);
		expect(f.error).not.toHaveBeenCalled();
	});
	it("does not save an identity profile with no selected key", async () => {
		const f = setup({ keys: [] });
		expect(await f.remote.addSftp()).toBeNull();
		expect(f.edit).not.toHaveBeenCalled();
		expect(f.error).toHaveBeenCalledWith(
			expect.objectContaining({ message: "choose ssh key" }),
		);
	});
	it("reports a native key-list failure without attempting a connection or profile change", async () => {
		const f = setup({ failList: true });
		expect(await f.remote.addSftp()).toBeNull();
		expect(f.prompt).not.toHaveBeenCalled();
		expect(f.edit).not.toHaveBeenCalled();
		expect(f.error).toHaveBeenCalledTimes(1);
	});
});
