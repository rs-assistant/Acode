package com.foxdebug.sftp;

import android.content.Context;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import com.sshtools.common.publickey.SshPublicKeyFileFactory;
import com.sshtools.common.ssh.components.SshKeyPair;
import com.sshtools.common.ssh.components.jce.JCEProvider;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Security;
import java.util.Arrays;
import java.util.Set;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.json.JSONObject;

/** Real Maverick/BC crypto, fake Android encrypted preferences. No real credentials. */
public class KeygenAudit {
  private static int checks;
  private static void check(boolean result, String message) {
    if (!result) throw new AssertionError(message);
    checks++;
  }
  private interface Checked { void run() throws Exception; }
  private static void rejects(Checked operation) throws Exception {
    try { operation.run(); } catch (Exception expected) { checks++; return; }
    throw new AssertionError("Operation should have been rejected");
  }

  public static void main(String[] args) throws Exception {
    Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME);
    Security.insertProviderAt(new BouncyCastleProvider(), 1);
    JCEProvider.enableBouncyCastle(true);
    SshIdentityStore store = new SshIdentityStore(new Context());
    check(!EncryptedPreferenceManager.lastAllowPlaintextFallback, "Vault must fail closed");
    check("acode_ssh_identity_keys_v1".equals(EncryptedPreferenceManager.lastNamespace), "Dedicated vault namespace required");
    check(store.listPublic().length() == 0, "Vault must start empty");

    String firstEdPublic = null;
    for (String algorithm : new String[] {"ed25519", "rsa4096"}) {
      JSONObject info = store.generate("dummy-" + algorithm, algorithm);
      if ("ed25519".equals(algorithm)) firstEdPublic = info.getString("publicKey");
      check(info.keySet().equals(Set.of("keyId", "label", "algorithm", "publicKey", "fingerprint")), "Public metadata allowlist changed");
      check(!info.toString().contains("PRIVATE KEY") && !info.has("privateKey"), "Private material escaped metadata");
      check(info.getString("algorithm").equals(algorithm), "Algorithm must be explicit");
      check(SshIdentityStore.validId(info.getString("keyId")), "Opaque identity ID required");
      SshKeyPair pair = store.loadKeyPair(info.getString("keyId"));
      byte[] payload = "dummy-signature-test-only".getBytes(StandardCharsets.UTF_8);
      byte[] signature = pair.getPrivateKey().sign(payload, pair.getPublicKey().getSigningAlgorithm());
      check(pair.getPublicKey().verifySignature(signature, payload), "Generated private/public keys must sign and verify");
      check(Arrays.equals(pair.getPublicKey().getEncoded(), SshPublicKeyFileFactory.parse(
        info.getString("publicKey").getBytes(StandardCharsets.UTF_8)).toPublicKey().getEncoded()), "OpenSSH public line must match the private key");
      check(!"rsa4096".equals(algorithm) || pair.getPublicKey().getBitLength() == 4096, "RSA must be 4096 bits");
      Path publicFile = Files.createTempFile("acode-dummy-public-", ".pub");
      try {
        Files.writeString(publicFile, info.getString("publicKey") + "\n");
        Process process = new ProcessBuilder("ssh-keygen", "-l", "-f", publicFile.toString()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        check(process.waitFor() == 0 && output.contains(info.getString("fingerprint")), "OpenSSH must accept the public key and agree on SHA-256 fingerprint");
      } finally { Files.deleteIfExists(publicFile); }
      SshIdentityStore reopened = new SshIdentityStore(new Context());
      check(reopened.getPublic(info.getString("keyId")).getString("publicKey").equals(info.getString("publicKey")), "Persisted metadata must survive reopening");
    }
    JSONObject duplicate = store.generate("dummy-second-ed25519", "ed25519");
    check(!duplicate.getString("publicKey").equals(firstEdPublic), "Distinct Ed25519 generations must not reuse a key");
    try (SshKeyMaterial material = SshKeyMaterial.generate("ed25519")) {
      byte[] bytes = material.privateKey;
      check(!Arrays.equals(bytes, new byte[bytes.length]), "Generated private bytes must be nonzero");
      material.close();
      check(Arrays.equals(bytes, new byte[bytes.length]), "Temporary private buffer must clear");
    }
    for (String label : new String[] {"", "x".repeat(81), "bad\nlabel", "bad\u0000label"}) {
      rejects(() -> store.generate(label, "ed25519"));
    }
    for (String algorithm : new String[] {"rsa1024", "dsa", "ECDSA", ""}) {
      rejects(() -> store.generate("dummy", algorithm));
    }
    for (String id : new String[] {"../acode_sftp_profiles_v1", "acode_sftp_profiles_v1", "identity-wrong", ""}) {
      rejects(() -> store.getPublic(id));
      rejects(() -> store.loadKeyPair(id));
      rejects(() -> store.delete(id));
    }
    int count = store.listPublic().length();
    EncryptedPreferenceManager.failWrites = true;
    try { rejects(() -> store.generate("dummy-failed-write", "ed25519")); }
    finally { EncryptedPreferenceManager.failWrites = false; }
    check(store.listPublic().length() == count, "Failed commit must not add a usable key");
    EncryptedPreferenceManager.failWrites = true;
    try { rejects(() -> store.delete(duplicate.getString("keyId"))); }
    finally { EncryptedPreferenceManager.failWrites = false; }
    check(store.getPublic(duplicate.getString("keyId")) != null, "Failed delete must preserve key");
    store.delete(duplicate.getString("keyId"));
    rejects(() -> store.loadKeyPair(duplicate.getString("keyId")));
    check(store.listPublic().length() == count - 1, "Delete must remove exactly one record");
    EncryptedPreferenceManager.failInitialization = true;
    try { rejects(() -> new SshIdentityStore(new Context())); }
    finally { EncryptedPreferenceManager.failInitialization = false; }
    EncryptedPreferenceManager raw = new EncryptedPreferenceManager(new Context(), "acode_ssh_identity_keys_v1", false);
    JSONObject full = new JSONObject();
    for (int i = 0; i < 32; i++) full.put("identity-" + java.util.UUID.randomUUID(), new JSONObject());
    raw.setStringSync("identities", full.toString());
    rejects(() -> store.generate("dummy-over-capacity", "ed25519"));
    raw.setStringSync("identities", "not-json");
    rejects(store::listPublic);
    rejects(() -> store.generate("dummy-corrupted-store", "ed25519"));
    check("not-json".equals(raw.getString("identities", "")), "A corrupt vault must not be silently overwritten");
    System.out.println(checks + " key-generation/vault regression assertions passed (real crypto, fake Android storage)");
  }
}
