package org.apache.cordova;
public class CallbackContext {
  public Object value;
  public Object error;
  public java.util.function.Consumer<PluginResult> listener;
  public void success() { value = Boolean.TRUE; }
  public void success(org.json.JSONObject value) { this.value = value; }
  public void success(String value) { this.value = value; }
  public void error(org.json.JSONObject value) { this.error = value; }
  public void error(String value) { this.error = value; }
  public void sendPluginResult(PluginResult result) {
    value = result;
    if (listener != null) listener.accept(result);
  }
}
