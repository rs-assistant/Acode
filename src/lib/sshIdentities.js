import nativeSftp from "./nativeSftp";

// An allowlist protects UI code from accidentally retaining future native fields.
export function publicIdentity(value) {
	if (
		!value ||
		!/^identity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
			value.keyId,
		) ||
		!["ed25519", "rsa4096"].includes(value.algorithm) ||
		typeof value.label !== "string" ||
		typeof value.publicKey !== "string" ||
		!/^ssh-(?:ed25519|rsa) [A-Za-z0-9+/]+=*(?: [^\r\n]*)?$/.test(
			value.publicKey,
		) ||
		!/^SHA256:[A-Za-z0-9+/]{43}$/.test(value.fingerprint)
	) {
		throw new Error("Invalid SSH public-key metadata");
	}
	return Object.freeze({
		keyId: value.keyId,
		label: value.label,
		algorithm: value.algorithm,
		publicKey: value.publicKey,
		fingerprint: value.fingerprint,
	});
}

export function listSshIdentities() {
	return new Promise((resolve, reject) => {
		nativeSftp.listSshKeys((items) => {
			try {
				resolve(items.map(publicIdentity));
			} catch (error) {
				reject(error);
			}
		}, reject);
	});
}

export function generateSshIdentity(label, algorithm = "ed25519") {
	if (
		typeof label !== "string" ||
		!label.trim() ||
		label.length > 80 ||
		/[\x00-\x1f\x7f]/.test(label) ||
		!["ed25519", "rsa4096"].includes(algorithm)
	) {
		return Promise.reject(new Error("Invalid SSH key name or algorithm"));
	}
	return new Promise((resolve, reject) => {
		nativeSftp.generateSshKey(
			label.trim(),
			algorithm,
			(value) => {
				try {
					resolve(publicIdentity(value));
				} catch (error) {
					reject(error);
				}
			},
			reject,
		);
	});
}

export function deleteSshIdentity(keyId) {
	return new Promise((resolve, reject) =>
		nativeSftp.deleteSshKey(keyId, resolve, reject),
	);
}
