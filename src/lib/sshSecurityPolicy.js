// Native policy is immutable for this app/WebView lifetime. Never read a mode
// switch from settings, localStorage, or a third-party plugin manifest.
let policyPromise;

export function getRuntimeSecurityPolicy() {
	if (!policyPromise) {
		policyPromise = new Promise((resolve) => {
			const unavailable = Object.freeze({
				mode: "unavailable",
				thirdPartyPluginsAllowed: false,
				savedSshAllowed: false,
			});
			const timeout = setTimeout(() => resolve(unavailable), 5000);
			const finish = (policy) => {
				clearTimeout(timeout);
				// Only the native SSH-safe policy is supported by this build.
				if (
					policy?.mode !== "ssh-safe" ||
					policy.thirdPartyPluginsAllowed !== false ||
					policy.savedSshAllowed !== true
				) {
					resolve(unavailable);
					return;
				}
				resolve(
					Object.freeze({
						...unavailable,
						mode: "ssh-safe",
						savedSshAllowed: true,
					}),
				);
			};
			try {
				const exec = cordova.require("cordova/exec");
				exec(finish, () => finish(null), "Tee", "getSecurityPolicy", []);
			} catch {
				finish(null);
			}
		});
	}
	return policyPromise;
}

export function pluginPolicyMessage(policy) {
	const key =
		policy.mode === "ssh-safe"
			? "ssh safe mode message"
			: "security policy unavailable";
	return (
		globalThis.strings?.[key] ||
		(policy.mode === "ssh-safe"
			? "SSH safe mode disables all third-party plugins, including plugin themes. Built-in SSH/SFTP remains available. Installed plugins and their settings are preserved."
			: "Security policy unavailable. Third-party plugins are blocked. Restart the app and try again.")
	);
}

export async function assertThirdPartyPluginsAllowed() {
	const policy = await getRuntimeSecurityPolicy();
	if (!policy.thirdPartyPluginsAllowed) {
		const error = new Error(pluginPolicyMessage(policy));
		error.name = "PluginExecutionBlockedError";
		throw error;
	}
}
