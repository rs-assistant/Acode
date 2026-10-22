import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) =>
	readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("SSH security invariants (source-level regression checks)", () => {
	it("disables application backup and configures Android 12+ extraction rules", () => {
		const config = read("config.xml");
		const rules = read("res/android/xml/data_extraction_rules.xml");
		expect(config).toMatch(/android:allowBackup="false"/);
		expect(config).toMatch(
			/android:dataExtractionRules="@xml\/data_extraction_rules"/,
		);
		expect(rules).toMatch(
			/<cloud-backup>[\s\S]*?<exclude domain="root" path="\."\s*\/>[\s\S]*?<\/cloud-backup>/,
		);
		expect(rules).toMatch(
			/<device-transfer>[\s\S]*?<exclude domain="root" path="\."\s*\/>[\s\S]*?<\/device-transfer>/,
		);
	});

	it("blocks release until native saved-profile authorization is implemented", () => {
		// Intentional red security gate: a method allowlist is NOT caller authorization.
		// Replace this source-level check with adversarial Android tests once a
		// genuinely isolated native caller-authentication boundary is implemented.
		const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		const nativeBridge = sftp.slice(sftp.indexOf("public boolean execute("));
		const connect = nativeBridge.indexOf('case "connectUsingProfile":');
		const shell = nativeBridge.indexOf('case "openShellUsingProfile":');
		expect(connect).toBeGreaterThan(-1);
		expect(shell).toBeGreaterThan(-1);
		// Current bridge exposes these operations without native caller authorization.
		// This assertion MUST fail until an independently authenticated native
		// authorization check is wired into dispatch and covered by device tests.
		expect(nativeBridge).toContain("enforceTrustedNativeCaller(");
	});

	it("validates plugin manifest before issuing a token", () => {
		const tee = read("src/plugins/pluginContext/src/android/Tee.java");
		const start = tee.indexOf("private synchronized void handleTokenRequest(");
		const end = tee.indexOf("private static String generateSecret()", start);
		const handler = tee.slice(start, end);
		expect(handler.indexOf("new JSONObject(pluginJson)")).toBeLessThan(
			handler.indexOf("tokenStore.put(pluginId, token)"),
		);
		expect(handler.indexOf("permissions.getString(i)")).toBeLessThan(
			handler.indexOf("permissionStore.put(token, permissionList)"),
		);
	});

	it("does not fall back to plaintext storage for plugin secrets", () => {
		const tee = read("src/plugins/pluginContext/src/android/Tee.java");
		const secretStoreCalls =
			tee.match(
				/new EncryptedPreferenceManager\(context, pluginId(?:, false)?\)/g,
			) ?? [];
		expect(secretStoreCalls).toHaveLength(4);
		expect(secretStoreCalls.every((call) => call.endsWith(", false)"))).toBe(
			true,
		);
	});

	it("revokes plugin capability tokens when the WebView resets", () => {
		const tee = read("src/plugins/pluginContext/src/android/Tee.java");
		const reset = tee.slice(
			tee.indexOf("public void onReset()"),
			tee.indexOf("public boolean execute("),
		);
		expect(reset).toContain("sessionId = null");
		expect(reset).toContain("tokenStore.clear()");
		expect(reset).toContain("permissionStore.clear()");
	});

	it("fails closed when encrypted SSH profile storage cannot initialize", () => {
		const store = read(
			"src/plugins/sftp/src/com/foxdebug/sftp/SftpSecurityStore.java",
		);
		const encryption = read(
			"src/plugins/auth/src/android/EncryptedPreferenceManager.java",
		);
		expect(store).toContain(
			"new EncryptedPreferenceManager(context, PROFILE_PREFS, false)",
		);
		expect(store).toContain(
			"new EncryptedPreferenceManager(context, HOST_PREFS, false)",
		);
		expect(encryption).toContain(
			'throw new IllegalStateException("Encrypted preferences are unavailable", e)',
		);
	});

	it("clears the temporary decoded SSH private-key buffer even on parse failure", () => {
		const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		const begin = sftp.indexOf(
			"private SshClientBuilder buildProfileBuilder(\n    JSONObject profile,",
		);
		const end = sftp.indexOf("private byte[] readUri(", begin);
		const builder = sftp.slice(begin, end);
		expect(builder).toContain("try {");
		expect(builder).toContain("finally {");
		expect(builder).toContain("java.util.Arrays.fill(privateKey, (byte) 0)");
	});

	it("does not silently trust unknown or changed SSH host keys", () => {
		const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		expect(sftp).toContain("sshContext.setHostKeyVerification(");
		expect(sftp).toContain(
			"confirmUnknownHost(endpoint, algorithm, fingerprint)",
		);
		expect(sftp).toContain('"HOST_KEY_CHANGED"');
	});
});

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
