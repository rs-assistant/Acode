package org.apache.cordova;

import org.json.JSONArray;
import org.json.JSONException;

public class CordovaPlugin {
    public void initialize(CordovaInterface cordova, CordovaWebView view) {}
    public void onReset() {}
    public boolean execute(String action, JSONArray args, CallbackContext callback)
            throws JSONException {
        throw new UnsupportedOperationException();
    }
}
