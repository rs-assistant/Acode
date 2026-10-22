// @vitest-environment happy-dom
import tag from "html-tag-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSourceModule } from "../helpers/loadSourceModule";

const safePolicy = {
	mode: "ssh-safe",
	thirdPartyPluginsAllowed: false,
	savedSshAllowed: true,
};

function policyModule(reply = safePolicy, fail = false) {
	const exec = vi.fn((success, failure) => {
		if (fail) failure("unavailable");
		else success(reply);
	});
	return {
		exec,
		...loadSourceModule(
			"src/lib/sshSecurityPolicy.js",
			{},
			{
				cordova: { require: () => exec },
				setTimeout,
				clearTimeout,
			},
		),
	};
}

afterEach(() => vi.useRealTimers());

describe("native SSH-safe policy", () => {
	it("reads the native policy once and returns an immutable value", async () => {
		const policy = policyModule();
		const result = await policy.getRuntimeSecurityPolicy();
		expect(result).toEqual(safePolicy);
		expect(Object.isFrozen(result)).toBe(true);
		expect(await policy.getRuntimeSecurityPolicy()).toBe(result);
		expect(policy.exec).toHaveBeenCalledTimes(1);
		expect(policy.exec.mock.calls[0].slice(2)).toEqual([
			"Tee",
			"getSecurityPolicy",
			[],
		]);
	});

	it.each([
		null,
		{},
		{ ...safePolicy, thirdPartyPluginsAllowed: true },
		{ ...safePolicy, thirdPartyPluginsAllowed: "false" },
		{ ...safePolicy, savedSshAllowed: false },
		{ ...safePolicy, mode: "plugins" },
	])("fails closed for malformed or incompatible policy %j", async (reply) => {
		const policy = policyModule(reply);
		expect(await policy.getRuntimeSecurityPolicy()).toMatchObject({
			mode: "unavailable",
			thirdPartyPluginsAllowed: false,
		});
		await expect(policy.assertThirdPartyPluginsAllowed()).rejects.toMatchObject(
			{
				name: "PluginExecutionBlockedError",
			},
		);
	});

	it("fails closed on native error or missing Cordova", async () => {
		for (const policy of [
			policyModule(null, true),
			loadSourceModule("src/lib/sshSecurityPolicy.js", {}),
		]) {
			expect((await policy.getRuntimeSecurityPolicy()).mode).toBe(
				"unavailable",
			);
		}
	});

	it("does not hang startup or reopen the gate after a late reply", async () => {
		vi.useFakeTimers();
		let callback;
		const policy = loadSourceModule(
			"src/lib/sshSecurityPolicy.js",
			{},
			{
				setTimeout,
				clearTimeout,
				cordova: {
					require: () => (success) => {
						callback = success;
					},
				},
			},
		);
		const pending = policy.getRuntimeSecurityPolicy();
		await vi.advanceTimersByTimeAsync(5000);
		expect((await pending).mode).toBe("unavailable");
		callback(safePolicy);
		expect((await policy.getRuntimeSecurityPolicy()).mode).toBe("unavailable");
	});
});

describe("real source plugin execution entry points", () => {
	it("shows a safe-mode notice instead of marketplace or install controls", async () => {
		const page = { append: vi.fn() };
		const app = { append: vi.fn() };
		const fs = vi.fn();
		const dependencies = Object.fromEntries(
			[
				"./plugins.scss",
				"components/contextmenu",
				"components/searchbar",
				"components/tabView",
				"components/tutorial",
				"dialogs/prompt",
				"lib/actionStack",
				"lib/auth",
				"lib/config",
				"lib/installPlugin",
				"lib/loadPlugin",
				"lib/settings",
				"pages/fileBrowser",
				"pages/plugin",
				"utils/helpers",
				"utils/Url",
				"./item",
			].map((name) => [name, {}]),
		);
		const { default: show } = loadSourceModule(
			"src/pages/plugins/plugins.js",
			{
				...dependencies,
				fileSystem: fs,
				"components/page": () => page,
				"html-tag-js": tag,
				"lib/sshSecurityPolicy": policyModule(),
			},
			{ app, tag, strings: { plugins: "Plugins" } },
		);
		await show([]);
		expect(page.append.mock.calls[0][0].textContent).toContain("SSH safe mode");
		expect(app.append).toHaveBeenCalledWith(page);
		expect(fs).not.toHaveBeenCalled();
	});

	it("blocks direct plugin details before purchases or filesystem access", async () => {
		const alert = vi.fn();
		const fs = vi.fn();
		const dependencies = Object.fromEntries(
			[
				"./plugin.scss",
				"components/page",
				"dialogs/loader",
				"handlers/intent",
				"handlers/purchase",
				"lib/actionStack",
				"lib/auth",
				"lib/config",
				"lib/customTab",
				"lib/installPlugin",
				"lib/installState",
				"lib/settings",
				"lib/startAd",
				"markdown-it",
				"markdown-it-anchor",
				"markdown-it-footnote",
				"markdown-it-github-alerts",
				"markdown-it-task-lists",
				"mime-types",
				"utils/codeHighlight",
				"utils/helpers",
				"utils/Url",
				"utils/version",
				"./plugin.view.js",
			].map((name) => [name, {}]),
		);
		const { default: show } = loadSourceModule(
			"src/pages/plugin/plugin.js",
			{
				...dependencies,
				fileSystem: fs,
				"dialogs/alert": alert,
				"lib/sshSecurityPolicy": policyModule(),
			},
			{ strings: { "ssh safe mode": "SSH safe mode" } },
		);
		await show("dummy.plugin", undefined, undefined, true);
		expect(alert).toHaveBeenCalledWith(
			"SSH safe mode",
			expect.stringContaining("disables all third-party plugins"),
		);
		expect(fs).not.toHaveBeenCalled();
	});

	it("blocks direct script loading before native connect, filesystem or DOM access", async () => {
		const policy = policyModule();
		const connect = vi.fn();
		const fs = vi.fn();
		const unmountPlugin = vi.fn();
		const { default: loadPlugin } = loadSourceModule(
			"src/lib/loadPlugin.js",
			{
				fileSystem: fs,
				"components/page": {},
				"utils/helpers": {},
				"utils/Url": {},
				"./actionStack": {},
				"./fileIcons": {},
				"./pluginContext": { connect },
				"./sshSecurityPolicy": policy,
			},
			{ acode: { unmountPlugin } },
		);
		await expect(loadPlugin("dummy.plugin")).rejects.toMatchObject({
			name: "PluginExecutionBlockedError",
		});
		expect(connect).not.toHaveBeenCalled();
		expect(fs).not.toHaveBeenCalled();
		expect(unmountPlugin).not.toHaveBeenCalled();
	});

	it("skips both theme and normal startup without filesystem reads or settings changes", async () => {
		const fs = vi.fn();
		const loadPlugin = vi.fn();
		const settings = { value: { pluginsDisabled: {} }, update: vi.fn() };
		const acode = {};
		const module = loadSourceModule(
			"src/lib/loadPlugins.js",
			{
				"../fileSystem": fs,
				"../utils/Url": {},
				"./loadPlugin": loadPlugin,
				"./settings": settings,
				"./sshSecurityPolicy": policyModule(),
			},
			{ acode },
		);
		const complete = vi.fn();
		acode[module.onPluginsLoadCompleteCallback] = complete;
		expect(await module.default(true)).toBe(0);
		expect(await module.default(false)).toBe(0);
		expect(module.isInitialPluginLoadComplete()).toBe(true);
		await expect(
			module.loadPluginWithTimeout("dummy.theme"),
		).rejects.toMatchObject({ name: "PluginExecutionBlockedError" });
		expect(module.BROKEN_PLUGINS.size).toBe(0);
		expect(complete).toHaveBeenCalledTimes(2);
		expect(loadPlugin).not.toHaveBeenCalled();
		expect(fs).not.toHaveBeenCalled();
		expect(settings.update).not.toHaveBeenCalled();
	});

	it("blocks installation before downloads, purchase handling or filesystem writes", async () => {
		const fs = vi.fn();
		const create = vi.fn();
		const { default: install } = loadSourceModule("src/lib/installPlugin.js", {
			fileSystem: fs,
			"dialogs/alert": {},
			"dialogs/confirm": {},
			"dialogs/loader": { create },
			"handlers/purchase": {},
			jszip: {},
			"utils/helpers": {},
			"utils/Url": {},
			"utils/version": {},
			"./config": {},
			"./installState": {},
			"./loadPlugins": {},
			"./sshSecurityPolicy": policyModule(),
		});
		await expect(install("dummy.plugin")).rejects.toMatchObject({
			name: "PluginExecutionBlockedError",
		});
		expect(fs).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	it("blocks cached/downloaded third-party developer tools before DOM or filesystem access", async () => {
		const fs = vi.fn();
		const { default: tools } = loadSourceModule("src/lib/devTools.js", {
			fileSystem: fs,
			"dialogs/loader": {},
			"utils/helpers": {},
			"utils/Url": {},
			"./config": {},
			"./sshSecurityPolicy": policyModule(),
		});
		await expect(tools.init()).rejects.toMatchObject({
			name: "PluginExecutionBlockedError",
		});
		expect(fs).not.toHaveBeenCalled();
	});
});
