package com.foxdebug.sftp;

import android.content.Context;
import androidx.security.crypto.EncryptedSharedPreferences;
import org.json.JSONObject;

public class SecurityStoreAudit {
  private interface Checked { void run() throws Exception; }
  private static int checks;
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
    checks++;
  }
  private static void rejects(Checked operation) throws Exception {
    try { operation.run(); } catch (java.security.GeneralSecurityException | org.json.JSONException | IllegalStateException expected) { checks++; return; }
    throw new AssertionError("Security-store operation should fail");
  }
  public static void main(String[] args) throws Exception {
    SftpSecurityStore store = new SftpSecurityStore(new Context());
    JSONObject profile = new JSONObject().put("hostname", "dummy.invalid").put("password", "dummy-only");
    String id = store.saveProfile(null, profile);
    check(store.getProfile(id).getString("hostname").equals("dummy.invalid"), "Profile round trip");
    store.trustHost("dummy.invalid:22", "ssh-ed25519", "SHA256:dummy", "dummy-public");
    check(store.getKnownHost("dummy.invalid:22").getString("publicKey").equals("dummy-public"), "Trust round trip");
    rejects(() -> store.deleteProfile("invalid"));
    String removed = store.saveProfile(null, profile);
    store.deleteProfile(removed);
    rejects(() -> store.getProfile(removed));
    if (args[0].equals("trust")) {
      EncryptedSharedPreferences.store("acode_ssh_known_hosts_v1").failWrites = true;
      rejects(() -> store.trustHost("dummy.invalid:22", "ssh-ed25519", "SHA256:unconfirmed", "dummy-new"));
      rejects(() -> store.getKnownHost("dummy.invalid:22"));
    } else {
      var raw = EncryptedSharedPreferences.store("acode_sftp_profiles_v1");
      raw.failWrites = true;
      if (args[0].equals("delete")) {
        rejects(() -> store.deleteProfile(id));
        check(!raw.contains(id), "Failed delete fixture must still mutate cache");
      } else {
        rejects(() -> store.saveProfile(id, new JSONObject().put("password", "dummy-unconfirmed")));
        check(raw.getString(id, "").contains("dummy-unconfirmed"), "Failed save fixture must still mutate cache");
      }
      rejects(() -> store.getProfile(id));
    }
    rejects(() -> new SftpSecurityStore(new Context()));
    System.out.println(checks + " production SFTP-store assertions passed (" + args[0] + ", fake Android adapters)");
  }
}
