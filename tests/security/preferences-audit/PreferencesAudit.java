import android.content.Context;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class PreferencesAudit {
  private static int checks;
  private interface Checked { void run() throws Exception; }
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
    checks++;
  }
  private static void rejects(Checked operation) throws Exception {
    try { operation.run(); } catch (IllegalStateException expected) { checks++; return; }
    throw new AssertionError("Storage operation must fail closed");
  }
  private static String namespace() { return "dummy-" + UUID.randomUUID(); }
  private static EncryptedPreferenceManager strict(String name) { return new EncryptedPreferenceManager(new Context(), name, false); }

  public static void main(String[] args) throws Exception {
    for (boolean masterFailure : new boolean[] {false, true}) {
      Context context = new Context();
      EncryptedSharedPreferences.failInitialization = !masterFailure;
      MasterKeys.fail = masterFailure;
      try {
        rejects(() -> new EncryptedPreferenceManager(context, namespace(), false));
        check(context.plaintextAccesses == 0, "Strict storage must never request plaintext");
        EncryptedPreferenceManager legacy = new EncryptedPreferenceManager(context, namespace());
        legacy.setString("dummy", "legacy");
        check("legacy".equals(legacy.getString("dummy", "")) && context.plaintextAccesses == 1, "Legacy fallback compatibility changed");
      } finally { MasterKeys.fail = false; EncryptedSharedPreferences.failInitialization = false; }
    }
    String happy = namespace();
    EncryptedPreferenceManager manager = strict(happy);
    manager.setString("string", "dummy-value");
    manager.setInt("int", 7);
    manager.setBoolean("bool", true);
    check("dummy-value".equals(manager.getString("string", "")), "String round trip");
    check(manager.getInt("int", 0) == 7 && manager.getBoolean("bool", false), "Typed round trips");
    check(manager.exists("string"), "Exists round trip");
    manager.remove("int");
    check(!manager.exists("int"), "Remove round trip");
    check(manager.setStringSync("sync", "dummy-sync") && manager.removeSync("sync"), "Synchronous round trips");
    manager.clear();
    check(!manager.exists("bool"), "Clear round trip");
    check(EncryptedSharedPreferences.store(happy).applies == 0, "Strict writes must not schedule unchecked apply()");

    String failed = namespace();
    EncryptedPreferenceManager writer = strict(failed);
    EncryptedPreferenceManager sibling = strict(failed);
    var raw = EncryptedSharedPreferences.store(failed);
    raw.failWrites = true;
    check(!writer.setStringSync("key", "dummy-unconfirmed"), "Disk failure must be reported");
    check("dummy-unconfirmed".equals(raw.getString("key", "")), "Fixture must reproduce Android cache-before-disk semantics");
    for (Checked operation : new Checked[] {
        () -> writer.getString("key", ""), () -> sibling.getString("key", ""),
        () -> writer.getInt("int", 0), () -> writer.getBoolean("bool", false),
        () -> writer.exists("key"), () -> writer.setString("key", "dummy"),
        () -> writer.setStringSync("key", "dummy"), () -> writer.setInt("int", 1),
        () -> writer.setBoolean("bool", true), () -> writer.remove("key"),
        () -> writer.removeSync("key"), writer::clear, () -> strict(failed)
    }) rejects(operation);
    raw.failWrites = false;
    rejects(() -> sibling.getString("key", ""));
    strict(namespace()).setString("key", "unrelated namespace remains usable");
    checks++;

    for (String kind : new String[] {"string", "int", "boolean", "remove", "removeSync", "clear", "exception"}) {
      String name = namespace();
      EncryptedPreferenceManager value = strict(name);
      var storage = EncryptedSharedPreferences.store(name);
      storage.failWrites = true;
      switch (kind) {
        case "string": rejects(() -> value.setString("key", "dummy")); break;
        case "int": rejects(() -> value.setInt("key", 1)); break;
        case "boolean": rejects(() -> value.setBoolean("key", true)); break;
        case "remove": rejects(() -> value.remove("key")); break;
        case "removeSync": check(!value.removeSync("key"), "Failed remove result"); break;
        case "clear": rejects(value::clear); break;
        case "exception": storage.throwWrites = true; rejects(() -> value.setStringSync("key", "dummy")); break;
      }
      rejects(() -> value.getString("key", ""));
      rejects(() -> strict(name));
    }

    String concurrent = namespace();
    EncryptedPreferenceManager first = strict(concurrent);
    EncryptedPreferenceManager second = strict(concurrent);
    var storage = EncryptedSharedPreferences.store(concurrent);
    storage.failWrites = true;
    storage.commitEntered = new CountDownLatch(1);
    storage.allowCommit = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var saving = pool.submit(() -> first.setStringSync("key", "dummy-pending"));
      check(storage.commitEntered.await(5, TimeUnit.SECONDS), "Writer must reach cache update");
      var reading = pool.submit(() -> second.getString("key", ""));
      try { reading.get(100, TimeUnit.MILLISECONDS); throw new AssertionError("Concurrent read exposed unconfirmed state"); }
      catch (TimeoutException expected) { checks++; }
      storage.allowCommit.countDown();
      check(!saving.get(5, TimeUnit.SECONDS), "Concurrent write failure must propagate");
      try { reading.get(5, TimeUnit.SECONDS); throw new AssertionError("Failed cached state escaped"); }
      catch (java.util.concurrent.ExecutionException expected) {
        check(expected.getCause() instanceof IllegalStateException, "Reader must fail closed after waiting");
      }
    } finally { storage.allowCommit.countDown(); pool.shutdownNow(); }
    String legacyName = namespace();
    EncryptedPreferenceManager legacy = new EncryptedPreferenceManager(new Context(), legacyName);
    legacy.setString("key", "dummy-legacy");
    check(EncryptedSharedPreferences.store(legacyName).applies == 1, "Legacy async behavior changed");
    System.out.println(checks + " production preference-manager assertions passed (fake Android/cache/disk adapters)");
  }
}
