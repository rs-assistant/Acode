package com.foxdebug.browser;

import android.content.Intent;
import com.foxdebug.browser.BrowserActivity;
import java.util.HashMap;
import java.util.Map;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class Plugin extends CordovaPlugin {

  private final Map<Integer, CallbackContext> closeCallbacks = new HashMap<>();
  private int nextRequest = 2000;

  @Override
  public synchronized boolean execute(
    String action,
    JSONArray args,
    CallbackContext callbackContext
  ) throws JSONException {
    if (action.equals("open")) {
      String url = args.getString(0);
      JSONObject theme = args.getJSONObject(1);
      boolean onlyConsole = args.optBoolean(2, false);
      String themeString = theme.toString();
      Intent intent = new Intent(cordova.getActivity(), BrowserActivity.class);

      intent.putExtra("url", url);
      intent.putExtra("theme", themeString);
      intent.putExtra("onlyConsole", onlyConsole);
      if (args.optBoolean(3, false)) {
        if (closeCallbacks.size() >= 4) {
          callbackContext.error("Too many preview windows");
          return true;
        }
        if (nextRequest > 65000) nextRequest = 2000;
        while (closeCallbacks.containsKey(nextRequest)) nextRequest++;
        int requestCode = nextRequest++;
        closeCallbacks.put(requestCode, callbackContext);
        try {
          cordova.startActivityForResult(this, intent, requestCode);
          PluginResult opened = new PluginResult(
            PluginResult.Status.OK,
            new JSONObject().put("event", "opened")
          );
          opened.setKeepCallback(true);
          callbackContext.sendPluginResult(opened);
        } catch (RuntimeException error) {
          closeCallbacks.remove(requestCode);
          callbackContext.error("Unable to open preview window");
        }
      } else {
        cordova.getActivity().startActivity(intent);
        callbackContext.success("Opened browser");
      }
      return true;
    }
    return false;
  }

  @Override
  public synchronized void onActivityResult(
    int requestCode,
    int resultCode,
    Intent data
  ) {
    CallbackContext callback = closeCallbacks.remove(requestCode);
    if (callback == null) return;
    try {
      callback.success(new JSONObject().put("event", "closed"));
    } catch (JSONException ignored) {
      callback.error("Preview window closed");
    }
  }

  private synchronized void clearCallbacks() {
    for (CallbackContext callback : closeCallbacks.values()) {
      try {
        callback.sendPluginResult(
          new PluginResult(PluginResult.Status.NO_RESULT)
        );
      } catch (RuntimeException ignored) {
        /* Reset must still retire all callbacks. */
      }
    }
    closeCallbacks.clear();
  }

  @Override
  public void onReset() {
    clearCallbacks();
    super.onReset();
  }

  @Override
  public void onDestroy() {
    clearCallbacks();
    super.onDestroy();
  }
}
