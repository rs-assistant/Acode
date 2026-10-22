package com.foxdebug.sftp;

import android.content.Context;
import androidx.security.crypto.EncryptedSharedPreferences;
import com.sshtools.common.ssh.components.jce.JCEProvider;
import java.security.Security;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.json.JSONObject;

/** Production vault + preference manager, real crypto, cache-first Android adapters. */
public class IdentityFailureAudit {
  private static int checks;
  private interface Checked { void run() throws Exception; }
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
    checks++;
  }
  private static void rejects(Checked operation) throws Exception {
    try { operation.run(); } catch (java.security.GeneralSecurityException | IllegalStateException expected) { checks++; return; }
    throw new AssertionError("Vault operation must fail closed");
  }
  public static void main(String[] args) throws Exception {
    Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME);
    Security.insertProviderAt(new BouncyCastleProvider(), 1);
    JCEProvider.enableBouncyCastle(true);
    SshIdentityStore store = new SshIdentityStore(new Context());
    SshIdentityStore sibling = new SshIdentityStore(new Context());
    JSONObject info = store.generate("dummy-persisted", "ed25519");
    String id = info.getString("keyId");
    check(sibling.listPublic().length() == 1 && sibling.loadKeyPair(id) != null, "Confirmed key must work before failure");
    var raw = EncryptedSharedPreferences.store("acode_ssh_identity_keys_v1");
    raw.failWrites = true;
    raw.throwWrites = args[0].equals("exception");
    if (args[0].equals("delete")) {
      rejects(() -> store.delete(id));
      check(new JSONObject(raw.getString("identities", "")).length() == 0, "Failed delete must mutate adapter cache");
    } else {
      rejects(() -> store.generate("dummy-unconfirmed", "ed25519"));
      check(new JSONObject(raw.getString("identities", "")).length() == 2, "Failed generation must mutate adapter cache");
    }
    raw.failWrites = false;
    raw.throwWrites = false;
    rejects(store::listPublic);
    rejects(() -> store.getPublic(id));
    rejects(() -> store.loadKeyPair(id));
    rejects(() -> sibling.loadKeyPair(id));
    rejects(() -> store.generate("dummy-retry", "ed25519"));
    rejects(() -> store.delete(id));
    rejects(() -> new SshIdentityStore(new Context()));
    System.out.println(checks + " production identity-vault failure assertions passed (" + args[0] + ", real crypto/cache-first Android adapters)");
  }
}
