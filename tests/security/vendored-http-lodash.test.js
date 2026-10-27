import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL(
		"../../src/plugins/cordova-plugin-advanced-http/www/lodash.js",
		import.meta.url,
	),
	"utf8",
);
function evaluate(expression) {
	const exports = {};
	const context = vm.createContext({ module: { exports }, exports });
	vm.runInContext(source, context);
	// Malicious paths and prototype mutations stay in this disposable VM realm.
	return vm.runInContext(`const _ = module.exports; ${expression}`, context);
}

describe("vendored Cordova HTTP cookie-path dependency", () => {
	it("uses the reviewed patched vendored version, not an untracked npm copy", () => {
		expect(evaluate("_.VERSION")).toBe("4.18.1");
	});
	it.each([
		'["__proto__", "acodeAuditMarker"]',
		'["constructor", "prototype", "acodeAuditMarker"]',
	])("does not allow cookie-style array paths to pollute prototypes: %s", (path) => {
		expect(
			evaluate(`_.set({}, ${path}, "dummy"); ({}).acodeAuditMarker`),
		).toBeUndefined();
	});
	it("does not unset inherited prototype properties through an array path", () => {
		expect(
			evaluate(`Object.prototype.acodeAuditMarker = "dummy";
			_.unset({}, ["__proto__", "acodeAuditMarker"]);
			({}).acodeAuditMarker`),
		).toBe("dummy");
	});
	it("retains the cookie store's nested array paths, values and removal API", () => {
		expect(
			evaluate(`const store = {}; const path = ["example.invalid", "/a.b/", "session"];
			_.set(store, path, { value: "dummy-cookie" });
			const found = _.get(store, path, null).value;
			const values = _.values(store["example.invalid"]["/a.b/"]).length;
			const removed = _.unset(store, path);
			[found, values, removed, _.get(store, path, null)]`),
		).toEqual(["dummy-cookie", 1, true, null]);
	});
	it("retains cookie-store round trips while refusing prototype-targeting records", () => {
		const store = readFileSync(
			new URL(
				"../../src/plugins/cordova-plugin-advanced-http/www/local-storage-store.js",
				import.meta.url,
			),
			"utf8",
		);
		expect(
			evaluate(`${store}
			let saved = null;
			const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
			const CookieStore = module.exports({ Store: function() {}, Cookie: { fromJSON: value => value } }, _);
			const cookies = new CookieStore(storage);
			const cookie = { domain: "example.invalid", path: "/a.b/", key: "session", value: "dummy-cookie" };
			cookies.putCookie(cookie, () => {});
			let value; cookies.findCookie(cookie.domain, cookie.path, cookie.key, (_error, result) => { value = result.value; });
			cookies.putCookie({ domain: "__proto__", path: "acodeAuditMarker", key: "nested", value: "dummy" }, () => {});
			cookies.removeCookie(cookie.domain, cookie.path, cookie.key, () => {});
			let missing; cookies.findCookie(cookie.domain, cookie.path, cookie.key, (_error, result) => { missing = result; });
			[value, missing, ({}).acodeAuditMarker]`),
		).toEqual(["dummy-cookie", null, undefined]);
	});
});
