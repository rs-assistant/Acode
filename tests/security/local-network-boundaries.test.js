import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import previewRequestPath from "../../src/lib/previewRequestPath";
import Url from "../../src/utils/Url";

describe("preview request syntax before filesystem/URI operations", () => {
	it.each([
		"/",
		"/index.html",
		"/assets/main.css",
		"/圖片.png",
		"/folder/a..b.js",
		"/assets/a%20b.png",
	])("keeps a normal preview resource: %s", (value) => {
		expect(previewRequestPath(value)).toBe(value.slice(1));
	});
	it.each([
		null,
		"",
		"index.html",
		"/../private",
		"/a/../../private",
		"/a/./file",
		"//other",
		"/file://secret",
		"/%2e%2e/private",
		"/%252e%252e/private",
		"/%2f../private",
		"/a%5c..%5cprivate",
		"/file%00.txt",
		"/bad%GG",
		"/bad%",
		"/path?query",
		"/file#fragment",
		"/a\u0000b",
		"/a\\..\\b",
	])("refuses ambiguous/traversal input: %s", (value) => {
		expect(previewRequestPath(value)).toBeNull();
	});
	it("gates the actual request handler before extension/URI/filesystem resolution", () => {
		// The general-purpose join intentionally normalizes parent segments; an
		// HTTP request must not be passed to it without the separate route guard.
		expect(Url.join("file:///dummy/project", "../outside.txt")).toBe(
			"file:///dummy/outside.txt",
		);
		const source = readFileSync("src/lib/run.js", "utf8");
		const start = source.indexOf("function handleRequest(req)");
		const handler = source.slice(
			start,
			source.indexOf("async function sendByExt", start),
		);
		expect(handler.indexOf("previewRequestPath(req.path)")).toBeLessThan(
			handler.indexOf("Url.extname(reqPath)"),
		);
		expect(handler).toContain("if (reqPath === null)");
		// Execute the real handler's guard prefix; later operations deliberately fail
		// if rejection does not return before touching them.
		const prefix = handler.slice(
			handler.indexOf("{") + 1,
			handler.indexOf("const ext ="),
		);
		const error = vi.fn();
		vm.runInNewContext(
			`(function(req){${prefix} throw Error('reached filesystem phase');})({requestId:'dummy',path:'/../private'})`,
			{ previewRequestPath, error, current: () => true },
		);
		expect(error).toHaveBeenCalledWith("dummy");
	});
});

function executorFixture(reply) {
	const module = { exports: {} };
	const sockets = [];
	const bridge = vi.fn((success) => success(reply));
	class Socket {
		constructor(url) {
			this.url = url;
			sockets.push(this);
		}
	}
	vm.runInNewContext(
		readFileSync("src/plugins/terminal/www/Executor.js", "utf8"),
		{
			module,
			require: () => bridge,
			WebSocket: Socket,
			console,
			setTimeout,
		},
	);
	return { executor: module.exports, sockets, bridge };
}

describe("native process endpoint JS wrapper", () => {
	it("uses the protected endpoint while keeping the callback contract", () => {
		const endpoint = { port: 12345, token: "a".repeat(64) };
		const fixture = executorFixture(endpoint);
		const ready = vi.fn(),
			error = vi.fn();
		fixture.executor.spawnStream(["dummy"], ready, error);
		expect(fixture.sockets[0].url).toBe(
			`ws://127.0.0.1:12345/${endpoint.token}`,
		);
		expect(fixture.sockets[0].binaryType).toBe("arraybuffer");
		fixture.sockets[0].onopen();
		expect(ready).toHaveBeenCalledWith(fixture.sockets[0]);
		fixture.sockets[0].onerror({ secret: endpoint.token });
		expect(error.mock.calls[0][0].message).toBe(
			"Process stream connection failed",
		);
	});
	it.each([
		12345,
		null,
		{},
		{ port: 0, token: "a".repeat(64) },
		{ port: 65536, token: "a".repeat(64) },
		{ port: 12345, token: "wrong" },
		{ port: "12345", token: "a".repeat(64) },
	])("fails closed for old/malformed native descriptors: %j", (reply) => {
		const fixture = executorFixture(reply),
			error = vi.fn();
		fixture.executor.spawnStream(["dummy"], vi.fn(), error);
		expect(error).toHaveBeenCalledTimes(1);
		expect(fixture.sockets).toHaveLength(0);
	});
});

describe("main WebView navigation configuration", () => {
	it("keeps the built-in preview private without changing custom external preview hosts", () => {
		const native = readFileSync(
			"src/plugins/server/src/android/com/foxdebug/server/NanoHTTPDWebserver.java",
			"utf8",
		);
		expect(native).toContain('super("127.0.0.1", port);');
		expect(native).not.toContain("super(port);");
		const source = readFileSync("src/lib/run.js", "utf8");
		expect(source).toContain(
			"previewServer.getUrl(`/${encodeURIComponent(filename)}`)",
		);
		expect(source).toContain("http://${host}:${previewPort}");
	});
	it("does not permit arbitrary websites as editor navigations; keeps network requests/external browsing", () => {
		const source = readFileSync("config.xml", "utf8");
		expect(source).not.toMatch(
			/<allow-navigation[^>]*href=["'](?:\*|https?:\/\/\*)/,
		);
		expect(source).toContain('<content src="index.html" />');
		expect(source).toContain('<access launch-external="yes" origin="*" />');
		expect(source).toContain('<allow-intent href="https://*/*" />');
	});
	it("revokes process streams on reset/destroy without reopening them via a JS fallback", () => {
		const source = readFileSync(
			"src/plugins/terminal/src/android/Executor.java",
			"utf8",
		);
		expect(source).toContain("revokeStreams(false)");
		expect(source).toContain("revokeStreams(true)");
		expect(source).toContain("streamEpoch != epoch");
		expect(source).toContain("new ProcessServer(0, cmd");
	});
});
