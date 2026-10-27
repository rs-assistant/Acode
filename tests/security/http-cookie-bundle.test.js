import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const directory = new URL(
	"../../src/plugins/cordova-plugin-advanced-http/www/",
	import.meta.url,
);
function setup() {
	const context = vm.createContext({ console, URL });
	const load = (file) => {
		vm.runInContext(
			"var module = { exports: {} }; var exports = module.exports;",
			context,
		);
		vm.runInContext(readFileSync(new URL(file, directory), "utf8"), context);
		return context.module.exports;
	};
	context.ToughCookie = load("umd-tough-cookie.js");
	context.lodash = load("lodash.js");
	context.makeStore = load("local-storage-store.js");
	context.makeHandler = load("cookie-handler.js");
	vm.runInContext(
		`var data = new Map();
		var storage = {getItem: key => data.has(key) ? data.get(key) : null,
			setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
		var window = {localStorage: storage};
		var Store = makeStore(ToughCookie, lodash);
		var handler = makeHandler(storage, ToughCookie, Store);`,
		context,
	);
	return (code) => vm.runInContext(code, context);
}

describe("actual browser cookie bundle and Cordova storage adapter", () => {
	it("loads the pinned library without any Node require/process/Buffer globals", () => {
		const run = setup();
		expect(run("ToughCookie.version")).toBe("4.1.4");
		expect(
			run("typeof require + '/' + typeof process + '/' + typeof Buffer"),
		).toBe("undefined/undefined/undefined");
		expect(run("new Store(storage) instanceof ToughCookie.Store")).toBe(true);
	});
	it.each([
		"__proto__",
		"constructor",
	])("protects default memory-store prototypes for special domain %s", (domain) => {
		const run = setup();
		expect(
			run(`var memory = new ToughCookie.MemoryCookieStore();
			memory.putCookie({domain: ${JSON.stringify(domain)}, path: "acodeCookieMarker", key: "dummy", value: "dummy"}, () => {});
			({}).acodeCookieMarker || Object.acodeCookieMarker`),
		).toBeUndefined();
	});
	it("keeps normal cookie writes, replacement and persisted-store reopening", () => {
		const run = setup();
		run(
			'handler.setCookie("https://example.com/a", "sid=one; Secure; HttpOnly; Path=/");',
		);
		expect(run('handler.getCookieString("https://example.com/a")')).toBe(
			"sid=one",
		);
		run(
			'handler.setCookie("https://example.com/a", "sid=two; Secure; Path=/");',
		);
		expect(
			run(
				'makeHandler(storage, ToughCookie, Store).getCookieString("https://example.com/a")',
			),
		).toBe("sid=two");
	});
	it("keeps secure, domain, path and expiry restrictions", () => {
		const run = setup();
		run(
			'handler.setCookie("https://example.com/a/x", "sid=one; Secure; Path=/a");',
		);
		expect(run('handler.getCookieString("http://example.com/a/x")')).toBe("");
		expect(run('handler.getCookieString("https://other.com/a/x")')).toBe("");
		expect(run('handler.getCookieString("https://example.com/b")')).toBe("");
		run(
			'handler.setCookie("https://example.com/a/x", "sid=gone; Secure; Path=/a; Max-Age=0");',
		);
		expect(run('handler.getCookieString("https://example.com/a/x")')).toBe("");
	});
	it("rejects public-suffix and mismatched cookie domains", () => {
		const run = setup();
		expect(() =>
			run(
				'handler.setCookie("https://example.com/", "x=y; Domain=com; Path=/");',
			),
		).toThrow();
		expect(() =>
			run(
				'handler.setCookie("https://example.com/", "x=y; Domain=other.com; Path=/");',
			),
		).toThrow();
	});
	it("retains internationalized domain normalization", () => {
		const run = setup();
		run(
			'handler.setCookie("https://bücher.de/", "sid=unicode; Domain=xn--bcher-kva.de; Path=/");',
		);
		expect(run('handler.getCookieString("https://xn--bcher-kva.de/")')).toBe(
			"sid=unicode",
		);
	});
	it("parses response cookies containing an Expires comma and ignores malformed ones", () => {
		const run = setup();
		run(
			'handler.setCookieFromString("https://example.com/", "a=one; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Path=/, b=two; Path=/");',
		);
		expect(run('handler.getCookieString("https://example.com/")')).toContain(
			"a=one",
		);
		expect(run('handler.getCookieString("https://example.com/")')).toContain(
			"b=two",
		);
		expect(() =>
			run(
				'handler.setCookieFromString("https://example.com/", "not a cookie");',
			),
		).not.toThrow();
	});
	it("retains localhost support, old adapter callbacks and removal APIs", () => {
		const run = setup();
		run('handler.setCookie("http://localhost/a", "x=y; Path=/");');
		expect(run('handler.getCookieString("http://localhost/a")')).toBe("x=y");
		expect(
			run(`var adapter = new Store(storage, '__advancedHttpCookieStore__'); var count;
			adapter.findCookies('localhost', '/', (_error, values) => {count = values.length;}); count`),
		).toBe(1);
		run('handler.removeCookies("http://localhost/a", () => {});');
		expect(run('handler.getCookieString("http://localhost/a")')).toBe("");
		run(
			'handler.setCookie("http://localhost/a", "x=y; Path=/"); adapter.removeAllCookies(() => {});',
		);
		expect(run('handler.getCookieString("http://localhost/a")')).toBe("");
		run(
			'handler.setCookie("http://localhost/a", "x=y; Path=/"); handler.clearCookies();',
		);
		expect(run('handler.getCookieString("http://localhost/a")')).toBe("");
	});
	it("does not return inherited domain data from the custom adapter", () => {
		const run = setup();
		expect(
			run(`Object.prototype.acodeDomain = {'/': {sid: {key:'sid',value:'dummy',domain:'acodeDomain',path:'/'}}};
			var found; new Store(storage).findCookies('acodeDomain', '/', true, (_error, values) => {found = values.length;}); found`),
		).toBe(0);
		expect(
			run(
				`new Store(storage).findCookie('acodeDomain', '/', 'sid', (_error, value) => {found = value;}); found`,
			),
		).toBeNull();
	});
	it.each([
		"null",
		"[]",
		"not-json",
	])("handles invalid persisted cookie caches without exposing inherited data: %s", (value) => {
		const run = setup();
		run(
			`storage.setItem('__advancedHttpCookieStore__', ${JSON.stringify(value)});`,
		);
		expect(run('handler.getCookieString("https://example.com/")')).toBe("");
	});
	it("supports the browser inspection fallback without a fake Node util module", () => {
		expect(() =>
			setup()("new ToughCookie.MemoryCookieStore().inspect()"),
		).not.toThrow();
	});
});
