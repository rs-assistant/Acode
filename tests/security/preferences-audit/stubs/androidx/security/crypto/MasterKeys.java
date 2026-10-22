package androidx.security.crypto;

import java.security.GeneralSecurityException;

public class MasterKeys {
  public static final Object AES256_GCM_SPEC = new Object();
  public static boolean fail;
  public static String getOrCreate(Object spec) throws GeneralSecurityException {
    if (fail) throw new GeneralSecurityException("dummy master-key failure");
    return "dummy-master-key";
  }
}
