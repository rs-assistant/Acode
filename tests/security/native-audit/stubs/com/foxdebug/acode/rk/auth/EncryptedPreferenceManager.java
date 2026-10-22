package com.foxdebug.acode.rk.auth;

import android.content.Context;
import java.util.HashMap;
import java.util.Map;

// Deliberately fake storage. This harness tests Tee's namespace selection and
// token handling, NOT Android encryption, Keystore, or plaintext persistence.
public class EncryptedPreferenceManager {
    private static final Map<String, Map<String, String>> STORES = new HashMap<>();
    public static String lastNamespace;
    public static boolean lastAllowPlaintextFallback;
    public static boolean failInitialization;
    private final Map<String, String> store;

    public EncryptedPreferenceManager(Context context, String namespace) {
        this(context, namespace, true);
    }

    public EncryptedPreferenceManager(Context context, String namespace, boolean fallback) {
        lastNamespace = namespace;
        lastAllowPlaintextFallback = fallback;
        if (failInitialization && !fallback) {
            throw new IllegalStateException("Dummy encrypted storage failure");
        }
        store = STORES.computeIfAbsent(namespace, ignored -> new HashMap<>());
    }

    public String getString(String key, String defaultValue) {
        return store.getOrDefault(key, defaultValue);
    }

    public void setString(String key, String value) { store.put(key, value); }
    public void remove(String key) { store.remove(key); }
    public void clear() { store.clear(); }
}
