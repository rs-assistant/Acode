import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("SSH security invariants (source-level regression checks)", () => {
  it("disables application backup and configures Android 12+ extraction rules", () => {
    const config = read("config.xml");
    const rules = read("res/android/xml/data_extraction_rules.xml");
    expect(config).toMatch(/android:allowBackup="false"/);
    expect(config).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
    expect(rules).toMatch(/<cloud-backup>[\\s\\S]*?<exclude domain="root" path="\."\s*\/>[\\s\\S]*?<\/cloud-backup>/);
    expect(rules).toMatch(/<device-transfer>[\\s\\S]*?<exclude domain="root" path="\."\s*\/>[\\s\\S]*?<\/device-transfer>/);
  });

  it("fails closed when encrypted SSH profile storage cannot initialize", () => {
    const store = read("src/plugins/sftp/src/com/foxdebug/sftp/SftpSecurityStore.java");
    const encryption = read("src/plugins/auth/src/android/EncryptedPreferenceManager.java");
    expect(store).toContain("new EncryptedPreferenceManager(context, PROFILE_PREFS, false)");
    expect(store).toContain("new EncryptedPreferenceManager(context, HOST_PREFS, false)");
    expect(encryption).toContain('throw new IllegalStateException("Encrypted preferences are unavailable", e)');
  });

  it("does not silently trust unknown or changed SSH host keys", () => {
    const sftp = read("src/plugins/sftp/src/com/foxdebug/sftp/Sftp.java");
    expect(sftp).toContain("sshContext.setHostKeyVerification(");
    expect(sftp).toContain("confirmUnknownHost(endpoint, algorithm, fingerprint)");
    expect(sftp).toContain('"HOST_KEY_CHANGED"');
  });
});
