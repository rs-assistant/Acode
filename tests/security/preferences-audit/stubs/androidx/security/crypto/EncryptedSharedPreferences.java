package androidx.security.crypto;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Cache-first failure model only: NO encryption, files, Keystore or real Android. */
public class EncryptedSharedPreferences {
  public enum PrefKeyEncryptionScheme { AES256_SIV }
  public enum PrefValueEncryptionScheme { AES256_GCM }
  private static final Map<String, MemoryPreferences> STORES = new ConcurrentHashMap<>();
  public static boolean failInitialization;
  public static MemoryPreferences store(String name) {
    return STORES.computeIfAbsent(name, ignored -> new MemoryPreferences());
  }
  public static SharedPreferences create(String name, String masterKey, Context context,
      PrefKeyEncryptionScheme keyScheme, PrefValueEncryptionScheme valueScheme) throws IOException {
    if (failInitialization) throw new IOException("dummy encrypted-store failure");
    return store(name);
  }

  public static class MemoryPreferences implements SharedPreferences {
    private final Map<String, Object> cache = new HashMap<>();
    public boolean failWrites;
    public boolean throwWrites;
    public int commits;
    public int applies;
    public CountDownLatch commitEntered;
    public CountDownLatch allowCommit;
    public synchronized String getString(String key, String fallback) { return (String) cache.getOrDefault(key, fallback); }
    public synchronized int getInt(String key, int fallback) { return (int) cache.getOrDefault(key, fallback); }
    public synchronized boolean getBoolean(String key, boolean fallback) { return (boolean) cache.getOrDefault(key, fallback); }
    public synchronized boolean contains(String key) { return cache.containsKey(key); }
    public Editor edit() { return new MemoryEditor(); }

    private class MemoryEditor implements Editor {
      private final Map<String, Object> updates = new HashMap<>();
      private boolean clear;
      public Editor putString(String key, String value) { updates.put(key, value); return this; }
      public Editor putInt(String key, int value) { updates.put(key, value); return this; }
      public Editor putBoolean(String key, boolean value) { updates.put(key, value); return this; }
      public Editor remove(String key) { updates.put(key, null); return this; }
      public Editor clear() { clear = true; return this; }
      private void updateCache() {
        synchronized (MemoryPreferences.this) {
          if (clear) cache.clear();
          updates.forEach((key, value) -> { if (value == null) cache.remove(key); else cache.put(key, value); });
        }
      }
      public boolean commit() {
        commits++;
        // Deliberately mutate first, even when disk confirmation fails.
        updateCache();
        if (commitEntered != null) commitEntered.countDown();
        if (allowCommit != null) {
          try {
            if (!allowCommit.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("fixture commit timeout");
          } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
        }
        if (throwWrites) throw new IllegalStateException("dummy write exception");
        return !failWrites;
      }
      public void apply() { applies++; updateCache(); }
    }
  }
}
