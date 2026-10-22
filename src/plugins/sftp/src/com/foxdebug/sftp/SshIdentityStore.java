package com.foxdebug.sftp;

import android.content.Context;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import com.sshtools.common.publickey.SshPrivateKeyFileFactory;
import com.sshtools.common.ssh.components.SshKeyPair;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.Base64;
import java.util.Iterator;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Dedicated encrypted vault; only allowlisted public metadata crosses to JS. */
final class SshIdentityStore {
  private final EncryptedPreferenceManager preferences;
  private static final int MAX_KEYS = 32;

  SshIdentityStore(Context context) {
    preferences = new EncryptedPreferenceManager(context, "acode_ssh_identity_keys_v1", false);
  }

  private JSONObject catalog() throws Exception {
    return new JSONObject(preferences.getString("identities", "{}"));
  }

  private void persist(JSONObject catalog) throws Exception {
    if (!preferences.setStringSync("identities", catalog.toString())) {
      throw new GeneralSecurityException("Could not securely persist SSH key");
    }
  }

  static boolean validId(String id) {
    return id != null && id.matches("identity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
  }

  private JSONObject record(JSONObject catalog, String id) throws Exception {
    if (!validId(id) || !catalog.has(id)) throw new GeneralSecurityException("SSH key is unavailable");
    return catalog.getJSONObject(id);
  }

  private static JSONObject publicInfo(JSONObject record) throws Exception {
    JSONObject info = new JSONObject();
    for (String field : new String[] {"keyId", "label", "algorithm", "publicKey", "fingerprint"}) {
      info.put(field, record.getString(field));
    }
    return info;
  }

  synchronized JSONArray listPublic() throws Exception {
    JSONObject catalog = catalog();
    JSONArray result = new JSONArray();
    for (Iterator<String> ids = catalog.keys(); ids.hasNext();) {
      result.put(publicInfo(record(catalog, ids.next())));
    }
    return result;
  }

  synchronized JSONObject getPublic(String id) throws Exception {
    return publicInfo(record(catalog(), id));
  }

  synchronized JSONObject generate(String label, String algorithm) throws Exception {
    if (label == null || label.trim().isEmpty() || label.length() > 80 ||
        label.chars().anyMatch(value -> Character.isISOControl(value))) {
      throw new IllegalArgumentException("Invalid SSH key label");
    }
    JSONObject catalog = catalog();
    if (catalog.length() >= MAX_KEYS) throw new IllegalStateException("SSH key limit reached");
    try (SshKeyMaterial material = SshKeyMaterial.generate(algorithm)) {
      String id = "identity-" + UUID.randomUUID();
      JSONObject record = new JSONObject();
      record.put("keyId", id);
      record.put("label", label.trim());
      record.put("algorithm", material.algorithm);
      record.put("publicKey", material.publicKey);
      record.put("fingerprint", material.fingerprint);
      record.put("privateKey", Base64.getEncoder().encodeToString(material.privateKey));
      catalog.put(id, record);
      persist(catalog);
      return publicInfo(record);
    }
  }

  synchronized SshKeyPair loadKeyPair(String id) throws Exception {
    byte[] privateKey = Base64.getDecoder().decode(record(catalog(), id).getString("privateKey"));
    try {
      return SshPrivateKeyFileFactory.parse(privateKey).toKeyPair("");
    } finally {
      Arrays.fill(privateKey, (byte) 0);
    }
  }

  synchronized void delete(String id) throws Exception {
    JSONObject catalog = catalog();
    record(catalog, id);
    catalog.remove(id);
    persist(catalog);
  }
}
