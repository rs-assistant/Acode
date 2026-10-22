import android.content.Context;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import com.foxdebug.acode.rk.plugin.Tee;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Regressions for the actual Tee.java source using dummy Android, Cordova,
 * and preference adapters. Does not certify shared-realm caller isolation.
 */
public class TeeAudit {
    private static int checks;
    private static CallbackContext call(Tee tee, String action, Object... args)
            throws Exception {
        CallbackContext callback = new CallbackContext();
        if (!tee.execute(action, new JSONArray(args), callback)) {
            throw new AssertionError("Unexpected action: " + action);
        }
        return callback;
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    public static void main(String[] args) throws Exception {
        Tee tee = new Tee();
        tee.initialize(Context::new, new CordovaWebView() {});
        JSONObject policy = (JSONObject) call(tee, "getSecurityPolicy").value;
        check("ssh-safe".equals(policy.getString("mode")), "SSH safe mode must be native policy");
        check(!policy.getBoolean("thirdPartyPluginsAllowed"), "Third-party themes and plugins must be disabled");
        check(policy.getBoolean("savedSshAllowed"), "Built-in SSH must remain enabled");
        check(!tee.execute("setSecurityPolicy", new JSONArray(), new CallbackContext()),
                "A JS caller must not change native policy");
        String session = (String) call(tee, "establishConnection").value;

        CallbackContext invalid = call(tee, "requestToken", "wrong-session", "example", "{}");
        check("INVALID_SESSION".equals(invalid.error), "Native session control changed");
        System.out.println("CONTROL: invalid session rejected by actual Tee.java");

        for (String id : new String[] {"acode_sftp_profiles_v1", "acode_ssh_known_hosts_v1",
                "acode_auth_secure", "../acode_sftp_profiles_v1", "foo/bar", "", "x".repeat(201)}) {
            CallbackContext rejected = call(tee, "requestToken", session, id, "{}");
            check("INVALID_PLUGIN_ID".equals(rejected.error) && rejected.value == null,
                    "App-owned or invalid plugin ID must not mint a token");
        }
        String pluginId = "example.plugin";
        String token = (String) call(tee, "requestToken", session, pluginId,
                "{\"permissions\":[\"read\"]}").value;
        check(token != null, "Valid plugin must obtain its own token");
        new EncryptedPreferenceManager(new Context(), pluginId, false)
                .setString("dummy-key", "legacy-dummy-only");
        check("".equals(call(tee, "get_secret", token, "dummy-key", "").value),
                "Do not automatically read a legacy arbitrary namespace");
        String namespace = EncryptedPreferenceManager.lastNamespace;
        check(namespace.matches("acode_plugin_secrets_v1_[0-9a-f]{64}"),
                "Plugin namespace must be separate and filesystem-safe");
        check(!EncryptedPreferenceManager.lastAllowPlaintextFallback, "Reads must fail closed");

        call(tee, "set_secret", token, "dummy-key", "new-dummy-only");
        check(!EncryptedPreferenceManager.lastAllowPlaintextFallback, "Writes must fail closed");
        check("new-dummy-only".equals(call(tee, "get_secret", token, "dummy-key", "").value),
                "Plugin CRUD round-trip must work");
        String other = (String) call(tee, "requestToken", session, "other.plugin", "{}").value;
        check("".equals(call(tee, "get_secret", other, "dummy-key", "").value),
                "Different plugin namespaces must not collide");
        check(!namespace.equals(EncryptedPreferenceManager.lastNamespace),
                "Different plugins must select different stores");
        call(tee, "delete_secret", token, "dummy-key");
        check(!EncryptedPreferenceManager.lastAllowPlaintextFallback, "Deletes must fail closed");
        check("".equals(call(tee, "get_secret", token, "dummy-key", "").value), "Delete failed");
        call(tee, "set_secret", token, "dummy-key", "dummy-only");
        call(tee, "clear_all_secrets", token);
        check(!EncryptedPreferenceManager.lastAllowPlaintextFallback, "Clear must fail closed");
        check("".equals(call(tee, "get_secret", token, "dummy-key", "").value), "Clear failed");

        EncryptedPreferenceManager.failInitialization = true;
        try {
            call(tee, "get_secret", token, "dummy-key", "");
            throw new AssertionError("Storage failure must not fall through to plaintext");
        } catch (IllegalStateException expected) {
            checks++;
        } finally {
            EncryptedPreferenceManager.failInitialization = false;
        }

        CallbackContext malformed = call(tee, "requestToken", session, "bad.manifest", "{");
        check("INVALID_PLUGIN_JSON".equals(malformed.error), "Invalid manifest must be rejected");
        java.lang.reflect.Field tokens = Tee.class.getDeclaredField("tokenStore");
        tokens.setAccessible(true);
        check(!((java.util.Map<?, ?>) tokens.get(tee)).containsKey("bad.manifest"),
                "Malformed manifest must not mint a token");
        call(tee, "requestToken", session, pluginId, "{");
        check(tee.grantedPermission(token, "read"), "Failed manifest update must not alter grants");

        String capability = (String) call(tee, "requestSftpCapability", session).value;
        check(Tee.isSftpCapability(capability), "App capability control failed");
        tee.onReset();
        check(!tee.isTokenValid(token, pluginId), "Old token must not survive reset");
        check(!Tee.isSftpCapability(capability), "Old SFTP capability must not survive reset");
        check("INVALID_TOKEN".equals(call(tee, "get_secret", token, "dummy-key", "").error),
                "Old token must be rejected after reset");
        check("INVALID_SESSION".equals(call(tee, "requestSftpCapability", session).error),
                "Old session must not mint new capabilities");
        session = (String) call(tee, "establishConnection").value;
        token = (String) call(tee, "requestToken", session, pluginId, "{}").value;
        capability = (String) call(tee, "requestSftpCapability", session).value;
        tee.onDestroy();
        check(!tee.isTokenValid(token, pluginId) && !Tee.isSftpCapability(capability),
                "Destroy must revoke tokens and capabilities");
        System.out.println(checks + " native regression assertions passed");
    }
}
