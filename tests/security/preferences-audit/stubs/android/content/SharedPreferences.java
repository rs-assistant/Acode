package android.content;

// Minimal API adapter, not Android's implementation or encryption.
public interface SharedPreferences {
  String getString(String key, String fallback);
  int getInt(String key, int fallback);
  boolean getBoolean(String key, boolean fallback);
  boolean contains(String key);
  Editor edit();
  interface Editor {
    Editor putString(String key, String value);
    Editor putInt(String key, int value);
    Editor putBoolean(String key, boolean value);
    Editor remove(String key);
    Editor clear();
    boolean commit();
    void apply();
  }
}
