/** Validate a NanoHTTPD-decoded request path before URI/path normalization. */
export default function previewRequestPath(value) {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.length > 16384
	)
		return null;
	const relative = value.slice(1);
	let probe = relative;
	for (let depth = 0; depth < 16; depth++) {
		if (
			probe.startsWith("/") ||
			/[\\?#:\u0000-\u001f\u007f]/.test(probe) ||
			probe.split("/").some((part) => part === "." || part === "..")
		)
			return null;
		if (!probe.includes("%")) return relative;
		try {
			const decoded = decodeURIComponent(probe);
			if (decoded === probe) return relative;
			probe = decoded;
		} catch {
			return null;
		}
	}
	// Do not accept arbitrarily layered encodings that downstream adapters might
	// decode differently. This is a syntax guard, not a filesystem symlink jail.
	return null;
}
