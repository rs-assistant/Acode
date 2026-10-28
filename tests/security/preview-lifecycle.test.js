import { readFileSync } from "node:fs";
import vm from "node:vm";
import mimeType from "mime-types";
import { describe, expect, it, vi } from "vitest";
import previewRequestPath from "../../src/lib/previewRequestPath";
import Url from "../../src/utils/Url";

function fixture() {
	const calls = [];
	const module = { exports: {} };
	let now = 1000;
	const exec = vi.fn((success, error, service, action, args) => {
		calls.push({ success, error, service, action, args });
	});
	vm.runInNewContext(readFileSync("src/plugins/server/www/server.js", "utf8"), {
		module,
		cordova: { exec },
		console,
		URL,
		Date: { now: () => now },
	});
	const opened = vi.fn();
	const error = vi.fn();
	const server = module.exports(12345, opened, error);
	const endpoint = { port: 12345, id: "a".repeat(32), token: "b".repeat(64) };
	const handler = vi.fn();
	function ready() {
		server.setOnRequestHandler(handler);
		calls.find((call) => call.action === "start").success(endpoint);
		calls
			.find((call) => call.action === "setOnRequestHandler")
			.success({ event: "ready" });
	}
	function emit(requestId = "dummy-request", timeoutMs = 10000) {
		calls
			.find((call) => call.action === "setOnRequestHandler")
			.success({
				requestId,
				timeoutMs,
				expiresAtMs: now + timeoutMs,
				path: "/index.html",
			});
	}
	return {
		calls,
		server,
		endpoint,
		opened,
		error,
		handler,
		ready,
		emit,
		advance: (ms) => {
			now += ms;
		},
	};
}

describe("actual Cordova preview wrapper lifecycle", () => {
	it("does not open until the native request handler acknowledges readiness", () => {
		const f = fixture();
		expect(() => f.server.getUrl()).toThrow("Preview is not ready");
		f.calls[0].success(f.endpoint);
		expect(f.opened).not.toHaveBeenCalled();
		f.server.setOnRequestHandler(f.handler);
		const registration = f.calls.find(
			(call) => call.action === "setOnRequestHandler",
		);
		expect(registration.args).toEqual([12345, f.endpoint.id]);
		registration.success({ event: "ready" });
		registration.success({ event: "ready" });
		expect(f.opened).toHaveBeenCalledTimes(1);
	});
	it.each([
		"Server started on port 12345",
		null,
		{},
		{ port: 0, id: "a".repeat(32), token: "b".repeat(64) },
		{ port: 12345, id: "wrong", token: "b".repeat(64) },
		{ port: 12345, id: "a".repeat(32), token: "wrong" },
	])("rejects legacy or malformed native descriptors: %j", (descriptor) => {
		const f = fixture();
		f.calls[0].success(descriptor);
		expect(f.error.mock.calls[0][0].code).toBe("UPDATE_REQUIRED");
		expect(f.calls).toHaveLength(1);
		expect(f.opened).not.toHaveBeenCalled();
	});
	it("constructs a same-origin bootstrap URL without exposing secrets on the public object", () => {
		const f = fixture();
		f.ready();
		const url = new URL(f.server.getUrl("/images/a%20b.png?keep=yes#top"));
		expect(url.origin).toBe("http://localhost:12345");
		expect(url.pathname).toBe("/images/a%20b.png");
		expect(url.searchParams.get("keep")).toBe("yes");
		expect(url.searchParams.get("__acode_preview")).toBe(f.endpoint.token);
		expect(url.hash).toBe("#top");
		expect(JSON.stringify(f.server)).not.toContain(f.endpoint.token);
		expect(() => f.server.getUrl("//untrusted.invalid/")).toThrow(
			"Invalid preview path",
		);
	});
	it("stops a late-started instance without registering or opening it", () => {
		const f = fixture();
		f.server.stop();
		f.server.stop();
		f.calls[0].success(f.endpoint);
		expect(f.calls.map((call) => call.action)).toEqual(["start", "stop"]);
		expect(f.calls[1].args).toEqual([12345, f.endpoint.id]);
		expect(f.opened).not.toHaveBeenCalled();
	});
	it("fences all response/stop operations to the exact native instance", () => {
		const f = fixture();
		f.ready();
		f.emit();
		f.server.send("unknown-request", { body: "no" });
		expect(f.calls).toHaveLength(2);
		f.server.send("dummy-request", { status: 200, body: "dummy" });
		const send = f.calls.find((call) => call.action === "send");
		expect(send.args).toEqual([
			12345,
			f.endpoint.id,
			"dummy-request",
			{ status: 200, body: "dummy" },
		]);
		f.server.send("dummy-request", { body: "duplicate" });
		expect(f.calls.filter((call) => call.action === "send")).toHaveLength(1);
		f.server.stop();
		f.emit("late");
		expect(f.handler).toHaveBeenCalledTimes(1);
		expect(() => f.server.getUrl()).toThrow("Preview is not ready");
	});
	it("drops expired work and bounds retained JS requests", () => {
		const f = fixture();
		f.ready();
		for (let index = 0; index < 9; index++) f.emit(`dummy-${index}`);
		expect(f.handler).toHaveBeenCalledTimes(8);
		f.advance(10001);
		f.server.send("dummy-0", { body: "too late" });
		expect(
			f.calls
				.filter((call) => call.action === "send")
				.every((call) => call.args[3].status === 503),
		).toBe(true);
		f.emit("fresh");
		expect(f.handler).toHaveBeenCalledTimes(9);
		expect(f.server.isRequestActive("fresh")).toBe(true);
		f.server.stop();
		expect(f.server.isRequestActive("fresh")).toBe(false);
	});
	it("does not forward raw native failure text or arbitrary error codes", () => {
		const f = fixture();
		f.calls[0].error({
			code: "dummy-private-url",
			message: "dummy-private-secret",
		});
		expect(f.error.mock.calls[0][0].message).toBe(
			"Preview operation unavailable",
		);
		expect(f.error.mock.calls[0][0].code).toBe("PREVIEW_FAILED");
	});
	it("discards messages already expired while queued in the native WebView bridge", () => {
		const f = fixture();
		f.ready();
		f.advance(20000);
		f.calls
			.find((call) => call.action === "setOnRequestHandler")
			.success({
				requestId: "old-native-message",
				timeoutMs: 10000,
				expiresAtMs: 11000,
				path: "/index.html",
			});
		expect(f.handler).not.toHaveBeenCalled();
		expect(f.calls.find((call) => call.action === "send").args[3].status).toBe(
			503,
		);
	});
	it("does not reset the native deadline to a fresh full JS timeout", () => {
		const f = fixture();
		f.ready();
		f.advance(8000);
		f.calls
			.find((call) => call.action === "setOnRequestHandler")
			.success({
				requestId: "short-budget",
				timeoutMs: 10000,
				expiresAtMs: 11000,
				path: "/index.html",
			});
		f.advance(2001);
		f.server.send("short-budget", { status: 200, body: "too late" });
		const calls = f.calls.filter((call) => call.action === "send");
		expect(calls).toHaveLength(1);
		expect(calls[0].args[3].status).toBe(503);
	});
	it("returns a static error if the request handler throws", () => {
		const f = fixture();
		f.ready();
		f.handler.mockImplementation(() => {
			throw new Error("dummy-private-error");
		});
		f.emit();
		expect(f.calls.find((call) => call.action === "send").args[3]).toEqual({
			status: 500,
			body: "Preview unavailable",
		});
	});
});

describe("preview/browser glue", () => {
	it("uses per-run responders, bounded retry/queue and activity-result close handling", () => {
		const source = readFileSync("src/lib/run.js", "utf8");
		expect(source).not.toContain("webServer?.send");
		expect(source).toContain("epoch !== previewEpoch");
		expect(source).toContain('err?.code === "PORT_IN_USE"');
		expect(source).toContain("++bindAttempts < 10");
		expect(source).toContain("queue.length >= 8");
		expect(source).toContain("previewServer.isRequestActive(id)");
		expect(source).toContain("browser.open(src, isConsole, () => {");
		const plugin = readFileSync(
			"src/plugins/browser/android/com/foxdebug/browser/Plugin.java",
			"utf8",
		);
		expect(plugin).toContain("startActivityForResult");
		expect(plugin).toContain("onActivityResult");
	});
	it("runs the real browser JS close callback without changing ordinary external opens", () => {
		const source = readFileSync("src/plugins/browser/index.js", "utf8")
			.replace(/^import .*;$/gm, "")
			.replace("export default", "module.exports =");
		const calls = [];
		const module = { exports: {} };
		vm.runInNewContext(source, {
			module,
			cordova: { exec: (...args) => calls.push(args) },
			settings: { value: { appTheme: "dummy" } },
			themes: { get: () => ({ toJSON: () => ({}) }) },
		});
		const close = vi.fn();
		module.exports.open("http://localhost:12345/", false, close);
		expect(calls[0][4][3]).toBe(true);
		calls[0][0]({ event: "opened" });
		expect(close).not.toHaveBeenCalled();
		calls[0][0]({ event: "closed" });
		expect(close).toHaveBeenCalledTimes(1);
		module.exports.open("https://example.invalid");
		expect(calls[1][4][3]).toBe(false);
	});
});

function runFixture() {
	const module = { exports: {} };
	const servers = [];
	const browser = { open: vi.fn() };
	const fsRead = vi.fn(
		async () => "<html><head></head><body>dummy</body></html>",
	);
	const fs = { exists: vi.fn(async () => true), readFile: fsRead };
	const uriCalls = [];
	const activeFile = {
		filename: "index.html",
		uri: "file:///dummy/index.html",
		location: "file:///dummy/",
		canRun: async () => true,
	};
	const appSettings = {
		value: {
			previewMode: "inapp",
			serverPort: 8080,
			previewPort: 8080,
			host: "localhost",
			console: 2,
		},
		CONSOLE_LEGACY: 1,
	};
	const context = {
		module,
		URL,
		console,
		mimeType,
		previewRequestPath,
		Url,
		browser,
		appSettings,
		localStorage: { __init_runPreview: true },
		editorManager: { activeFile, getFile: () => null },
		helpers: { uuid: () => "dummy-uuid", error: vi.fn() },
		fsOperation: () => fs,
		config: { CONSOLE_PORT: 8090 },
		ASSETS_DIRECTORY: "file:///dummy-assets/",
		DATA_STORAGE: "file:///dummy-data/",
		document: {
			head: { querySelector: () => null },
			body: { getAttribute: () => "dark" },
		},
		mustache: { render: () => "dummy console" },
		$_console: "dummy",
		getDocText: () => "dummy source",
		sdcard: {
			formatUri: (path, success, error) =>
				uriCalls.push({ path, success, error }),
		},
		CreateServer: (port, ready) => {
			const server = {
				stopped: false,
				port,
				ready,
				send: vi.fn(),
				getUrl: (path) =>
					`http://localhost:${port}${path}?__acode_preview=dummy`,
				expired: new Set(),
				isRequestActive: (id) => !server.stopped && !server.expired.has(id),
				setOnRequestHandler: (handler) => {
					server.handler = handler;
				},
				stop: vi.fn(() => {
					server.stopped = true;
				}),
			};
			servers.push(server);
			return server;
		},
	};
	const source = readFileSync("src/lib/run.js", "utf8")
		.replace(/^import .*;$/gm, "")
		.replace("export default run;", "module.exports = run;");
	vm.runInNewContext(source, context);
	return {
		run: module.exports,
		servers,
		browser,
		fsRead,
		uriCalls,
		activeFile,
		appSettings,
	};
}

describe("actual preview controller with explicit filesystem/browser adapters", () => {
	it("opens the authenticated URL and stops exactly that instance on window close", async () => {
		const f = runFixture();
		await f.run(false, "inapp", true);
		f.servers[0].ready();
		expect(f.browser.open.mock.calls[0][0]).toBe(
			"http://localhost:8080/index.html?__acode_preview=dummy",
		);
		f.browser.open.mock.calls[0][2]();
		expect(f.servers[0].stop).toHaveBeenCalledTimes(1);
	});
	it("never routes a late filesystem response into a replacement preview", async () => {
		const f = runFixture();
		let release;
		f.fsRead.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		await f.run(false, "inapp", true);
		f.servers[0].ready();
		f.servers[0].handler({ requestId: "old", path: "/index.html" });
		await vi.waitFor(() => expect(f.fsRead).toHaveBeenCalledTimes(1));
		await f.run(false, "inapp", true);
		f.servers[1].ready();
		release("<html>old document</html>");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(f.servers[0].send).not.toHaveBeenCalled();
		expect(f.servers[1].send).not.toHaveBeenCalled();
		f.browser.open.mock.calls[0][2]();
		expect(f.servers[1].stop).not.toHaveBeenCalled();
	});
	it("contains asynchronous read errors without exposing paths", async () => {
		const f = runFixture();
		f.fsRead.mockRejectedValue(new Error("dummy-private-path"));
		await f.run(false, "inapp", true);
		f.servers[0].ready();
		f.servers[0].handler({ requestId: "broken", path: "/index.html" });
		await vi.waitFor(() => expect(f.servers[0].send).toHaveBeenCalled());
		expect(f.servers[0].send.mock.calls[0]).toEqual([
			"broken",
			{ status: 404, body: "File not found!" },
		]);
	});
	it("bounds the pending file queue and advances it even after provider failure", async () => {
		const f = runFixture();
		f.activeFile.location =
			"content://com.android.externalstorage.documents/tree/primary%3ADummy::primary:Dummy";
		await f.run(false, "inapp", true);
		f.servers[0].ready();
		for (let index = 0; index < 10; index++)
			f.servers[0].handler({
				requestId: `file-${index}`,
				path: `/image-${index}.png`,
			});
		expect(f.uriCalls).toHaveLength(1);
		expect(
			f.servers[0].send.mock.calls.some((call) => call[1].status === 503),
		).toBe(true);
		f.uriCalls[0].error(new Error("dummy provider error"));
		await vi.waitFor(() => expect(f.uriCalls).toHaveLength(2));
	});
	it("rejects unknown console routes without dereferencing a missing active file", async () => {
		const f = runFixture();
		await f.run(true, "inapp", true);
		f.servers[0].ready();
		f.servers[0].handler({ requestId: "missing", path: "/unknown" });
		await vi.waitFor(() => expect(f.servers[0].send).toHaveBeenCalled());
		expect(f.servers[0].send.mock.calls[0][1].status).toBe(404);
		expect(f.fsRead).not.toHaveBeenCalled();
	});
	it("skips expired queued work without blocking the next live file", async () => {
		const f = runFixture();
		f.activeFile.location =
			"content://com.android.externalstorage.documents/tree/primary%3ADummy::primary:Dummy";
		await f.run(false, "inapp", true);
		f.servers[0].ready();
		for (const id of ["first", "expired", "fresh"]) {
			f.servers[0].handler({ requestId: id, path: `/${id}.png` });
		}
		f.servers[0].expired.add("expired");
		f.uriCalls[0].error(new Error("dummy provider error"));
		await vi.waitFor(() => expect(f.uriCalls).toHaveLength(2));
		expect(f.uriCalls[1].path.endsWith("/fresh.png")).toBe(true);
	});
});
