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
		for (const section of ["cloud-backup", "device-transfer"]) {
			const body = rules.split(`<${section}>`)[1].split(`</${section}>`)[0];
			for (const domain of [
				"root",
				"file",
				"database",
				"sharedpref",
				"external",
				"device_root",
				"device_file",
				"device_database",
				"device_sharedpref",
			]) {
				expect(body).toContain(`<exclude domain="${domain}" path="." />`);
			}
		}
	});

	it("does not forward raw native exceptions to JS or Android logs", () => {
		const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		expect(sftp).not.toMatch(/\.getMessage\(/);
		expect(sftp).not.toMatch(/(?:error|failure|e)\.toString\(/);
		expect(sftp).not.toMatch(/Log\.[we]\([^;]*,\s*(?:e|error|failure)\s*\)/);
		expect(sftp).toContain("return SftpErrors.message(e)");
		expect(sftp).toContain("shell.finish(null, SftpErrors.message(error))");
	});

	it("requires the native safe-build policy before any third-party script loading", () => {
		// The user selected the no-plugin safe edition, NOT shared-realm caller
		// authentication. Behavioral coverage lives in ssh-safe-mode.test.js and
		// the native harness. Device acceptance remains a separate release gate.
		const tee = read("src/plugins/pluginContext/src/android/Tee.java");
		expect(tee).toContain('.put("mode", "ssh-safe")');
		expect(tee).toContain('.put("thirdPartyPluginsAllowed", false)');
		expect(tee).not.toContain('"setSecurityPolicy"');
		const loader = read("src/lib/loadPlugin.js");
		const gate = loader.indexOf("await assertThirdPartyPluginsAllowed()");
		expect(gate).toBeGreaterThan(-1);
		expect(gate).toBeLessThan(loader.indexOf("await connect()"));
		expect(gate).toBeLessThan(loader.indexOf("document.head.append($script)"));
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
				/EncryptedPreferenceManager prefs =\s*pluginSecretStore\(pluginId\)/g,
			) ?? [];
		expect(secretStoreCalls).toHaveLength(4);
		expect(tee).toContain("PLUGIN_STORE_PREFIX + toHex(digest), false)");
		expect(tee).not.toContain(
			"new EncryptedPreferenceManager(context, pluginId",
		);
	});

	it("revokes plugin capability tokens when the WebView resets", () => {
		const tee = read("src/plugins/pluginContext/src/android/Tee.java");
		const reset = tee.slice(
			tee.indexOf("public void onReset()"),
			tee.search(/public (?:synchronized )?boolean execute\(/),
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

	it("uses explicit native day/night themes for all security dialogs", () => {
		const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
		const theme = read(
			"src/plugins/sftp/src/com/foxdebug/sftp/SftpDialogTheme.java",
		);
		expect(sftp.match(/new AlertDialog\.Builder\(/g)).toHaveLength(1);
		expect(
			sftp.match(/= securityDialogBuilder\(\)|\n\s*securityDialogBuilder\(\)/g),
		).toHaveLength(3);
		expect(sftp).toContain(
			"SftpDialogTheme.forUiMode(activity.getResources().getConfiguration().uiMode)",
		);
		expect(theme).toContain("android.R.style.Theme_Material_Dialog_Alert");
		expect(theme).toContain(
			"android.R.style.Theme_Material_Light_Dialog_Alert",
		);
		expect(sftp).toContain(
			'.setNegativeButton("Cancel", (ignored, which) -> decision.countDown())',
		);
		expect(sftp).toContain('"Trust and connect"');
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
