import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

// Execute the installed Android Cordova JS modules, not a reimplementation of
// exec/provider. Only native responses, browser events, and bridge init are
// simulated. This fixture never opens a network connection or a real SSH store.
export function createCordovaAuditBridge({ connected = null } = {}) {
	const requireNode = createRequire(import.meta.url);
	const cordovaRoot = path.dirname(
		requireNode.resolve("cordova-android/package.json"),
	);
	const source = fs.readFileSync(
		path.join(cordovaRoot, "templates/project/assets/www/cordova.js"),
		"utf8",
	);
	const factories = new Map();
	const modules = new Map();
	const calls = [];
	const session = "dummy-audit-session";
	const capability = "dummy-audit-capability";
	let sessionEstablished = false;
	let connection = connected;
	const cordova = {
		callbacks: {},
		callbackId: 1,
		addWindowEventHandler() {},
		fireWindowEvent() {},
	};
	const native = {
		exec(_bridgeSecret, service, action, callbackId, argsJson) {
			const args = JSON.parse(argsJson);
			calls.push({ service, action, args });
			const callback = cordova.callbacks[callbackId];
			const success = (value) => {
				callback?.success?.(value);
				delete cordova.callbacks[callbackId];
			};
			const fail = (error) => {
				callback?.fail?.(error);
				delete cordova.callbacks[callbackId];
			};
			if (service === "Tee" && action === "establishConnection") {
				if (sessionEstablished) fail("CONNECTION_ALREADY_ESTABLISHED");
				else {
					sessionEstablished = true;
					success(session);
				}
			} else if (service === "Tee" && action === "requestSftpCapability") {
				if (sessionEstablished && args[0] === session) success(capability);
				else fail("INVALID_SESSION");
			} else if (service === "Sftp") {
				// This models the intended native gate; it is NOT a Java test.
				if (args[0] !== capability) fail("SFTP authorization required");
				else if (action === "isConnected") success(connection);
				else if (action === "connectUsingProfile") {
					connection = args[1];
					success("/");
				} else if (action === "stat") {
					success({ url: args[1], exists: true, isDirectory: false, size: 1 });
				} else if (action === "lsDir") success([]);
				else if (action === "exec") success("dummy command output");
				else fail(`Unimplemented audit action: ${action}`);
			} else fail(`Unimplemented audit service: ${service}`);
			return "";
		},
		retrieveJsMessages: () => "",
		setNativeToJsBridgeMode() {},
	};
	const noop = () => {};
	const sandbox = {
		define: (id, factory) => factories.set(id, factory),
		_cordovaNative: native,
		window: { _cordovaNative: native, addEventListener: noop },
		document: { addEventListener: noop },
		prompt: () => "1",
		Promise,
		setTimeout,
		console,
	};
	modules.set("cordova", cordova);
	modules.set("cordova/utils", {
		typeName: (value) => Object.prototype.toString.call(value).slice(8, -1),
	});
	modules.set("cordova/base64", {});
	modules.set("cordova/channel", { onNativeReady: { fire: noop } });
	for (const id of ["cordova/android/nativeapiprovider", "cordova/exec"]) {
		const start = source.indexOf(`define("${id}",`);
		const end = source.indexOf("\n// file:", start + 1);
		if (start < 0 || end < 0) {
			throw new Error(`Installed Cordova module not found: ${id}`);
		}
		vm.runInNewContext(source.slice(start, end), sandbox, {
			filename: `installed-${id}.js`,
		});
	}
	function requireModule(id) {
		if (!modules.has(id)) {
			const factory = factories.get(id);
			if (!factory) throw new Error(`Unexpected Cordova dependency: ${id}`);
			const module = { exports: {} };
			factory.call(sandbox, requireModule, module.exports, module);
			modules.set(id, module.exports);
		}
		return modules.get(id);
	}
	cordova.require = requireModule;
	cordova.exec = requireModule("cordova/exec");
	cordova.exec.init();
	return {
		cordova,
		calls,
		invoke: (service, action, args) =>
			new Promise((resolve, reject) => {
				cordova.exec(resolve, reject, service, action, args);
			}),
	};
}
