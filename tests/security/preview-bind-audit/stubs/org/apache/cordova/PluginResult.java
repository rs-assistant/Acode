package org.apache.cordova;
public class PluginResult {
  public enum Status { OK }
  public PluginResult(Status status, org.json.JSONObject value) { throw new AssertionError("Cordova request bridge not under test"); }
  public void setKeepCallback(boolean keep) { throw new AssertionError("Cordova request bridge not under test"); }
}
