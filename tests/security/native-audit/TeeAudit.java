import android.content.Context;
import com.foxdebug.acode.rk.auth.EncryptedPreferenceManager;
import com.foxdebug.acode.rk.plugin.Tee;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;

/**
 * Exercise the actual Tee.java source using dummy Android, Cordova, and
 * preference storage adapters. Fixed defects are checked as regressions;
 * outstanding vulnerability characterizations remain explicitly labelled.
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

        check(!EncryptedPreferenceManager.lastAllowPlaintextFallback,
                "Plugin secret storage must fail closed");
        System.out.println("REGRESSION: plugin secret accessor disables plaintext fallback");

        tee.onReset();
        check(!tee.isTokenValid(token, profileStore), "Old token must not survive reset");
        check("INVALID_TOKEN".equals(call(tee, "get_secret", token, "profile-dummy", "").error),
                "Old token must be rejected after reset");
        System.out.println("REGRESSION: reset revokes issued plugin tokens");
        System.out.println("4 native checks completed (1 control, 2 regressions, 1 outstanding characterization)");
    }
}
