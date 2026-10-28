package org.apache.cordova;
public class PluginResult {
  public enum Status { OK, NO_RESULT }
  public final Status status;
  public final org.json.JSONObject value;
  public boolean keep;
  public PluginResult(Status status) { this(status, null); }
  public PluginResult(Status status, org.json.JSONObject value) { this.status = status; this.value = value; }
  public void setKeepCallback(boolean keep) { this.keep = keep; }
}
