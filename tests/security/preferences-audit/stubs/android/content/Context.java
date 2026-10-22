package android.content;

import androidx.security.crypto.EncryptedSharedPreferences;

public class Context {
  public static final int MODE_PRIVATE = 0;
  public int plaintextAccesses;
  public SharedPreferences getSharedPreferences(String name, int mode) {
    plaintextAccesses++;
    return EncryptedSharedPreferences.store("plaintext-" + name);
  }
}
