package org.apache.cordova;
public class CordovaPlugin {
  protected CordovaInterface cordova;
  public void initialize(CordovaInterface cordova, CordovaWebView webView) { this.cordova = cordova; }
  public boolean execute(String action, org.json.JSONArray args, CallbackContext callback) throws org.json.JSONException { return false; }
  public void onReset() {}
  public void onDestroy() {}
  public void onActivityResult(int code, int result, android.content.Intent data) {}
}
