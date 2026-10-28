package com.foxdebug.server;

import java.net.BindException;
import java.util.HashMap;
import java.util.Map;
import org.apache.cordova.*;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class Server extends CordovaPlugin {

  private final Map<Integer, NanoHTTPDWebserver> servers = new HashMap<>();
  private boolean destroyed;

  @Override
  public boolean execute(
    String action,
    JSONArray args,
    CallbackContext callback
  ) throws JSONException {
    synchronized (servers) {
      if ("start".equals(action)) {
        servers.values().removeIf(NanoHTTPDWebserver::isClosed);
        int port = args.optInt(0, -1);
        if (destroyed || port < 0 || port > 65535) {
          fail(callback, "INVALID_STATE");
          return true;
        }
        if (servers.size() >= 4) {
          fail(callback, "SERVER_LIMIT");
          return true;
        }
        if (port != 0 && servers.containsKey(port)) {
          fail(callback, "PORT_IN_USE");
          return true;
        }
        NanoHTTPDWebserver server = new NanoHTTPDWebserver(
          port,
          cordova.getContext()
        );
        try {
          server.start(5000, true);
          servers.put(server.getListeningPort(), server);
          callback.success(server.descriptor());
        } catch (Exception error) {
          servers.values().remove(server);
          server.stop();
          fail(
            callback,
            error instanceof BindException ? "PORT_IN_USE" : "START_FAILED"
          );
        }
        return true;
      }
      if (
        !"stop".equals(action) &&
        !"send".equals(action) &&
        !"setOnRequestHandler".equals(action)
      ) return false;
      int port = args.optInt(0, -1);
      NanoHTTPDWebserver server = servers.get(port);
      if (server == null || !server.owns(args.optString(1))) {
        fail(callback, "STALE_PREVIEW");
        return true;
      }
      switch (action) {
        case "stop":
          servers.remove(port);
          server.stop();
          callback.success();
          break;
        case "setOnRequestHandler":
          if (!server.setRequestHandler(callback)) fail(
            callback,
            "HANDLER_UNAVAILABLE"
          );
          break;
        case "send":
          JSONObject response = args.optJSONObject(3);
          if (
            response == null ||
            !server.completeResponse(args.optString(2), response)
          ) fail(callback, "EXPIRED_REQUEST");
          else callback.success();
          break;
        default:
          return false;
      }
      return true;
    }
  }

  private static void fail(CallbackContext callback, String code)
    throws JSONException {
    callback.error(
      new JSONObject()
        .put("code", code)
        .put("message", "Preview operation unavailable")
    );
  }

  private void revoke(boolean permanent) {
    synchronized (servers) {
      destroyed |= permanent;
      for (NanoHTTPDWebserver server : servers.values()) server.stop();
      servers.clear();
    }
  }

  @Override
  public void onReset() {
    revoke(false);
    super.onReset();
  }

  @Override
  public void onDestroy() {
    revoke(true);
    super.onDestroy();
  }
}
