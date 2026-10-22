package com.foxdebug.acode.rk.auth;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.concurrent.ConcurrentHashMap;

public class EncryptedPreferenceManager {
    private final SharedPreferences sharedPreferences;
    private final boolean strict;
    private final StoreState state;
    private static final ConcurrentHashMap<String, StoreState> STRICT_STORES = new ConcurrentHashMap<>();

    private static final class StoreState {
        boolean failed;
    }

    /**
     * @param context  The Android Context
     * @param prefName The custom name for your preference file (e.g., "user_session")
     */
    public EncryptedPreferenceManager(Context context, String prefName) {
        this(context, prefName, true);
    }

    /**
     * @param context                The Android Context
     * @param prefName               The custom name for your preference file
     * @param allowPlaintextFallback Whether storage may fall back to ordinary
     *                               SharedPreferences when encryption is unavailable
     */
    public EncryptedPreferenceManager(
            Context context,
            String prefName,
            boolean allowPlaintextFallback
    ) {
        strict = !allowPlaintextFallback;
        // Android updates the in-process preferences cache before commit() can
        // report a disk failure. Share the failure latch AND the lock across
        // managers so neither a concurrent read nor reopening this namespace can
        // authenticate with unconfirmed state. Recovery requires a new process.
        state = strict
                ? STRICT_STORES.computeIfAbsent(prefName, ignored -> new StoreState())
                : new StoreState();
        synchronized (state) {
            ensureUsable();
            SharedPreferences preferences;
            try {
                String masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);

                // EncryptedSharedPreferences handles encryption of both Keys and Values
                preferences = EncryptedSharedPreferences.create(
                        prefName,
                        masterKeyAlias,
                        context,
                        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                );
            } catch (GeneralSecurityException | IOException e) {
                if (!allowPlaintextFallback) {
                    throw new IllegalStateException("Encrypted preferences are unavailable", e);
                }

                // Preserve the existing behavior for legacy callers unless strict mode is requested.
                preferences = context.getSharedPreferences(prefName, Context.MODE_PRIVATE);
            }
            sharedPreferences = preferences;
        }
    }

    private void ensureUsable() {
        if (state.failed) throw new IllegalStateException("Encrypted preferences require app restart after a storage failure");
    }

    // Caller holds state, including across the cache update and disk result.
    private boolean commit(SharedPreferences.Editor editor) {
        ensureUsable();
        try {
            boolean saved = editor.commit();
            if (strict && !saved) state.failed = true;
            return saved;
        } catch (RuntimeException error) {
            if (strict) state.failed = true;
            throw error;
        }
    }

    private void write(SharedPreferences.Editor editor) {
        if (strict) {
            if (!commit(editor)) throw new IllegalStateException("Could not persist encrypted preferences");
        } else {
            editor.apply();
        }
    }

    public void setString(String key, String value) {
        synchronized (state) {
            ensureUsable();
            write(sharedPreferences.edit().putString(key, value));
        }
    }

    public boolean setStringSync(String key, String value) {
        synchronized (state) {
            ensureUsable();
            return commit(sharedPreferences.edit().putString(key, value));
        }
    }

    public String getString(String key, String defaultValue) {
        synchronized (state) {
            ensureUsable();
            return sharedPreferences.getString(key, defaultValue);
        }
    }

    public void setInt(String key, int value) {
        synchronized (state) {
            ensureUsable();
            write(sharedPreferences.edit().putInt(key, value));
        }
    }

    public int getInt(String key, int defaultValue) {
        synchronized (state) {
            ensureUsable();
            return sharedPreferences.getInt(key, defaultValue);
        }
    }

    public void setBoolean(String key, boolean value) {
        synchronized (state) {
            ensureUsable();
            write(sharedPreferences.edit().putBoolean(key, value));
        }
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        synchronized (state) {
            ensureUsable();
            return sharedPreferences.getBoolean(key, defaultValue);
        }
    }

    public void remove(String key) {
        synchronized (state) {
            ensureUsable();
            write(sharedPreferences.edit().remove(key));
        }
    }

    public boolean removeSync(String key) {
        synchronized (state) {
            ensureUsable();
            return commit(sharedPreferences.edit().remove(key));
        }
    }

    public boolean exists(String key) {
        synchronized (state) {
            ensureUsable();
            return sharedPreferences.contains(key);
        }
    }

    public void clear() {
        synchronized (state) {
            ensureUsable();
            write(sharedPreferences.edit().clear());
        }
    }
}
