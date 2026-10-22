import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) =>
	fs.readFileSync(path.join(root, relativePath), "utf8");

describe("SSH authorization boundary", () => {
	it("does not expose the SFTP bridge as a window global", () => {
		const pluginXml = read("src/plugins/sftp/plugin.xml");
		const coreSources = [
			"src/fileSystem/sftp.js",
			"src/lib/sftpProfiles.js",
			"src/components/terminal/terminal.js",
			"src/pages/fileBrowser/fileBrowser.js",
		].map(read);

		expect(pluginXml).not.toContain('clobbers target="window.sftp"');
		for (const source of coreSources) {
			expect(source).not.toContain("window.sftp");
		}
	});

	it("requires the private capability before dispatching every SFTP action", () => {
		const source = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		const authorization = source.indexOf("Tee.isSftpCapability");
		const dispatch = source.indexOf(
			"method.invoke(this, authorizedArgs, callback)",
		);

		expect(authorization).toBeGreaterThanOrEqual(0);
		expect(dispatch).toBeGreaterThan(authorization);
		expect(source).toContain('callback.error("SFTP authorization required")');
	});

	it("keeps the SFTP capability inside app modules", () => {
		const bridge = read("src/lib/nativeSftp.js");
		const context = read("src/lib/pluginContext.js");

		expect(bridge).toContain("getSftpCapability");
		expect(bridge).not.toContain("globalThis.sftp");
		expect(context).toContain('"requestSftpCapability"');
	});
});
