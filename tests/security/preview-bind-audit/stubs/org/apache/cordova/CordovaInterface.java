package org.apache.cordova;
public interface CordovaInterface {
  android.content.Context getContext();
  default android.app.Activity getActivity() { return new android.app.Activity(); }
  default void startActivityForResult(CordovaPlugin plugin, android.content.Intent intent, int code) {}
}
