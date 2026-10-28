import com.foxdebug.browser.Plugin;
import java.util.*;
import org.apache.cordova.*;
import org.json.*;

public class BrowserCloseAudit {
  private static int assertions;
  private static void check(boolean value, String description) {
    if (!value) throw new AssertionError(description);
    assertions++;
  }
  public static void main(String[] args) throws Exception {
    List<Integer> results = new ArrayList<>();
    android.app.Activity activity = new android.app.Activity();
    CordovaInterface adapter = new CordovaInterface() {
      public android.content.Context getContext() { return null; }
      public android.app.Activity getActivity() { return activity; }
      public void startActivityForResult(CordovaPlugin plugin, android.content.Intent intent, int code) { results.add(code); }
    };
    Plugin plugin = new Plugin();
    plugin.initialize(adapter, new CordovaWebView() {});
    JSONArray preview = new JSONArray().put("http://localhost:12345/dummy").put(new JSONObject()).put(false).put(true);
    CallbackContext one = new CallbackContext();
    check(plugin.execute("open", preview, one), "preview window starts through activity result");
    check(((PluginResult) one.value).keep, "opened event keeps close callback");
    check(results.size() == 1, "activity result request registered");
    plugin.onActivityResult(results.get(0), 0, null);
    check(((JSONObject) one.value).getString("event").equals("closed"), "cancellation or finish reports close event");
    one.value = null;
    plugin.onActivityResult(results.get(0), 0, null);
    check(one.value == null, "duplicate/stale activity result ignored");
    List<CallbackContext> pending = new ArrayList<>();
    for (int index = 0; index < 4; index++) {
      CallbackContext callback = new CallbackContext();
      plugin.execute("open", preview, callback);
      pending.add(callback);
    }
    CallbackContext tooMany = new CallbackContext();
    plugin.execute("open", preview, tooMany);
    check(tooMany.error != null && results.size() == 5, "pending close callbacks bounded");
    plugin.onReset();
    for (CallbackContext callback : pending) {
      check(((PluginResult) callback.value).status == PluginResult.Status.NO_RESULT && !((PluginResult) callback.value).keep, "reset releases old callback");
    }
    CallbackContext ordinary = new CallbackContext();
    plugin.execute("open", new JSONArray().put("https://example.invalid/").put(new JSONObject()).put(false), ordinary);
    check(activity.launched == 1 && ordinary.value.equals("Opened browser"), "ordinary external browsing keeps old completion contract");
    plugin.onDestroy();
    System.out.println(assertions + " production browser close-callback assertions passed (stubbed Activity/Cordova, not real Android UI)");
  }
}
