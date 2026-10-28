package com.foxdebug.server;

import fi.iki.elonen.NanoHTTPD;
import java.io.*;
import java.lang.reflect.Proxy;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;
import org.apache.cordova.*;
import org.json.*;

/** Production HTTP/auth/registry with real sockets; explicit fake Cordova, no file serving. */
public final class PreviewRuntimeAudit {
  private static int assertions;
  private record Reply(int status, Map<String, String> headers, String body) {}
  private static void check(boolean value, String description) {
    if (!value) throw new AssertionError(description);
    assertions++;
  }
  private static void await(BooleanSupplier condition, String description) throws Exception {
    long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
    while (!condition.getAsBoolean() && System.nanoTime() < end) Thread.sleep(5);
    check(condition.getAsBoolean(), description);
  }
  private static Reply request(int port, String method, String path, Map<String, String> headers) throws Exception {
    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress("127.0.0.1", port), 1000);
      socket.setSoTimeout(3000);
      StringBuilder wire = new StringBuilder(method + " " + path + " HTTP/1.1\r\n");
      if (!headers.containsKey("Host")) wire.append("Host: 127.0.0.1:").append(port).append("\r\n");
      wire.append("Connection: close\r\n");
      for (var entry : headers.entrySet()) wire.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
      wire.append("\r\n");
      socket.getOutputStream().write(wire.toString().getBytes(StandardCharsets.UTF_8));
      String result = new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
      if (result.isEmpty()) throw new EOFException("Preview connection closed");
      String[] parts = result.split("\r\n\r\n", 2);
      String[] lines = parts[0].split("\r\n");
      Map<String, String> responseHeaders = new HashMap<>();
      for (int index = 1; index < lines.length; index++) {
        int colon = lines[index].indexOf(':');
        if (colon > 0) responseHeaders.put(lines[index].substring(0, colon).toLowerCase(Locale.ROOT), lines[index].substring(colon + 1).trim());
      }
      return new Reply(Integer.parseInt(lines[0].split(" ")[1]), responseHeaders, parts.length == 2 ? parts[1] : "");
    }
  }
  private static Reply get(int port, String path, String cookie) throws Exception {
    return request(port, "GET", path, cookie == null ? Map.of() : Map.of("Cookie", cookie));
  }
  private static String bootstrap(NanoHTTPDWebserver server) throws Exception {
    JSONObject descriptor = server.descriptor();
    Reply result = get(server.getListeningPort(), "/index.html?keep=yes&__acode_preview=" + descriptor.getString("token"), null);
    check(result.status == 303, "one-time bootstrap redirects");
    check(result.headers.get("location").equals("/index.html?keep=yes"), "redirect strips only bootstrap secret");
    check(result.headers.get("referrer-policy").equals("no-referrer"), "bootstrap no-referrer");
    check(result.headers.get("cache-control").equals("no-store"), "bootstrap no-store");
    String cookie = result.headers.get("set-cookie");
    check(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict") && cookie.contains("Path=/"), "private session cookie flags");
    check(!cookie.contains(descriptor.getString("token")), "browser session differs from bootstrap capability");
    return cookie.split(";", 2)[0];
  }
  private static NanoHTTPD.IHTTPSession fakeSession(int port, String cookie) {
    return (NanoHTTPD.IHTTPSession) Proxy.newProxyInstance(PreviewRuntimeAudit.class.getClassLoader(), new Class<?>[]{NanoHTTPD.IHTTPSession.class},
      (proxy, method, args) -> switch (method.getName()) {
        case "getHeaders" -> Map.of("host", "127.0.0.1:" + port, "cookie", cookie);
        case "getMethod" -> NanoHTTPD.Method.GET;
        case "getParameters" -> Map.of();
        case "getUri" -> "/dummy";
        case "getQueryParameterString" -> null;
        default -> throw new AssertionError("Unexpected session API in focused limit test");
      });
  }

  public static void main(String[] args) throws Exception {
    ExecutorService clients = Executors.newFixedThreadPool(4);
    NanoHTTPDWebserver server = new NanoHTTPDWebserver(0, null, 2, 250, 60_000);
    BlockingQueue<JSONObject> requests = new LinkedBlockingQueue<>();
    AtomicInteger mode = new AtomicInteger();
    AtomicInteger successfulReplies = new AtomicInteger();
    AtomicBoolean duplicateRejected = new AtomicBoolean();
    AtomicBoolean expiredWithinCallback = new AtomicBoolean();
    CallbackContext handler = new CallbackContext();
    handler.listener = event -> {
      if (event.value == null || !event.value.has("requestId")) return;
      requests.add(event.value);
      if (mode.get() == 0) {
        String id = event.value.getString("requestId");
        if (server.completeResponse(id, new JSONObject().put("status", 200).put("body", "dummy preview"))) successfulReplies.incrementAndGet();
        duplicateRejected.set(!server.completeResponse(id, new JSONObject().put("status", 200).put("body", "duplicate")));
      } else if (mode.get() == 2) throw new IllegalStateException("dummy-private-error-must-not-leak");
      else if (mode.get() == 3) {
        java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(300));
        expiredWithinCallback.set(!server.completeResponse(event.value.getString("requestId"), new JSONObject().put("status", 200).put("body", "late")));
      }
    };
    try {
      server.start(5000, true);
      check(server.setRequestHandler(handler), "register handler with ready handshake");
      check(((PluginResult) handler.value).value.getString("event").equals("ready"), "ready event delivered first");
      check(!server.setRequestHandler(new CallbackContext()), "handler cannot be silently replaced");
      int port = server.getListeningPort();
      JSONObject descriptor = server.descriptor();
      check(server.owns(descriptor.getString("id")) && !server.owns("wrong"), "instance fence");
      check(get(port, "/index.html", null).status == 403, "tokenless local client refused");
      check(get(port, "/?__acode_preview=wrong", null).status == 403, "wrong bootstrap refused");
      String token = descriptor.getString("token");
      check(get(port, "/?__acode_preview=" + token + "&__acode_preview=" + token, null).status == 403, "duplicate bootstrap refused");
      check(requests.isEmpty(), "unauthorized requests never enter file/JS phase");
      String cookie = bootstrap(server);
      check(get(port, "/?__acode_preview=" + token, cookie).status == 403, "used bootstrap cannot be replayed");
      check(get(port, "/index.html", cookie).body.equals("dummy preview"), "authenticated normal HTML response");
      check(successfulReplies.get() == 1 && duplicateRejected.get(), "response accepted only once");
      JSONObject forwarded = requests.remove();
      check(!forwarded.getJSONObject("headers").has("cookie"), "cookie not sent to JS");
      check(forwarded.getInt("timeoutMs") == 250, "bounded deadline conveyed to JS");
      check(server.pendingCount() == 0, "successful request removed");
      Reply assets = get(port, "/assets/main.css", cookie);
      check(assets.status == 200, "absolute asset paths stay usable");
      Reply head = request(port, "HEAD", "/asset.png", Map.of("Cookie", cookie));
      check(head.status == 200 && head.body.isEmpty(), "real HEAD status=" + head.status + " bodyBytes=" + head.body.length());
      Reply gzipHead = request(port, "HEAD", "/asset.png", Map.of("Cookie", cookie, "Accept-Encoding", "gzip"));
      check(gzipHead.status == 200 && gzipHead.body.isEmpty(), "HEAD cannot emit a gzip body either");
      check(request(port, "POST", "/upload", Map.of("Cookie", cookie)).status == 405, "preview does not parse upload bodies");
      check(request(port, "OPTIONS", "/", Map.of("Cookie", cookie)).status == 405, "no unauthenticated CORS preflight route");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Host", "untrusted.invalid:" + port)).status == 403, "foreign host refused");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Origin", "http://untrusted.invalid")).status == 403, "foreign Origin refused even with cookie");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Origin", "null")).status == 403, "opaque Origin refused");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Sec-Fetch-Site", "same-site")).status == 403, "cross-port same-site browser context refused");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Sec-Fetch-Site", "cross-site")).status == 403, "cross-site browser context refused");
      check(get(port, "/", cookie + "; " + cookie).status == 403, "ambiguous duplicate session cookie refused");
      check(get(port, "/", "acode_preview_" + port + "=wrong").status == 403, "wrong session cookie refused");
      check(request(port, "GET", "/", Map.of("Cookie", cookie, "Origin", "http://127.0.0.1:" + port,
        "Sec-Fetch-Site", "same-origin", "Authorization", "dummy-secret", "Referer", "http://dummy.invalid/private")).status == 200, "same-origin request allowed");
      JSONObject last = null;
      while (!requests.isEmpty()) last = requests.remove();
      check(!last.getJSONObject("headers").has("authorization") && !last.getJSONObject("headers").has("referer"), "sensitive ambient headers withheld from JS");
      mode.set(2);
      Reply error = get(port, "/", cookie);
      check(error.status == 503 && !error.body.contains("dummy-private"), "bridge failures are static and fail closed");
      check(server.pendingCount() == 0, "exception removes pending entry");
      String failedDispatch = requests.remove().getString("requestId");
      check(!server.completeResponse(failedDispatch, new JSONObject()) && server.dispatchedCount() == 0, "discard retires failed-delivery ticket without accepting expired data");
      mode.set(3);
      check(get(port, "/", cookie).status == 503 && expiredWithinCallback.get(), "deadline includes bridge dispatch; late completion rejected before waiter cleanup");
      requests.clear();
      mode.set(1);
      long started = System.nanoTime();
      Reply timeout = get(port, "/", cookie);
      check(timeout.status == 503 && timeout.body.contains("timed out"), "missing response reaches deadline");
      check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2000, "timeout bounded in real HTTP");
      String oldRequest = requests.remove().getString("requestId");
      check(server.pendingCount() == 0 && !server.completeResponse(oldRequest, new JSONObject()), "late response rejected without retaining it");
      Future<?> one = clients.submit(() -> { try { get(port, "/one", cookie); } catch (Exception ignored) {} });
      Future<?> two = clients.submit(() -> { try { get(port, "/two", cookie); } catch (Exception ignored) {} });
      await(() -> server.pendingCount() == 2, "two requests can wait concurrently");
      NanoHTTPD.Response busy = server.serve(fakeSession(port, cookie));
      check(busy.getStatus().getRequestStatus() == 503 && server.pendingCount() == 2, "extra request cannot enlarge pending registry");
      server.stop();
      one.get(2, TimeUnit.SECONDS); two.get(2, TimeUnit.SECONDS);
      check(server.pendingCount() == 0 && server.connectionCount() == 0, "stop cancels waiters and closes clients");
      check(!server.completeResponse(oldRequest, new JSONObject()), "stopped instance rejects late response");
      boolean cannotRestart = false;
      try { server.start(5000, true); } catch (IOException expected) { cannotRestart = true; }
      check(cannotRestart, "stopped server cannot reopen listener");
    } finally { server.stop(); clients.shutdownNow(); }

    NanoHTTPDWebserver idle = new NanoHTTPDWebserver(0, null, 2, 100, 80);
    try {
      idle.start(5000, true);
      await(() -> !idle.isAlive(), "unused listener expires automatically");
    } finally { idle.stop(); }
    testPluginRegistry();
    testConnectionLimit();
    testIndependentSessions();
    testPausedBridgeBackpressure();
    System.out.println(assertions + " production preview HTTP/authorization/deadline/lifecycle assertions passed (real sockets, stubbed Cordova; no Android device or file provider)");
  }

  private static CallbackContext call(Server plugin, String action, JSONArray args) throws Exception {
    CallbackContext result = new CallbackContext();
    check(plugin.execute(action, args, result), "plugin recognizes protected action");
    return result;
  }
  private static void testPluginRegistry() throws Exception {
    Server plugin = new Server();
    plugin.initialize(() -> null, new CordovaWebView() {});
    try {
      try (java.net.ServerSocket occupied = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
        CallbackContext collision = call(plugin, "start", new JSONArray().put(occupied.getLocalPort()));
        check(((JSONObject) collision.error).getString("code").equals("PORT_IN_USE"), "only actual bind collision gets retryable error");
      }
      JSONObject first = (JSONObject) call(plugin, "start", new JSONArray().put(0)).value;
      int port = first.getInt("port");
      String id = first.getString("id");
      check(call(plugin, "stop", new JSONArray().put(port).put("wrong")).error != null, "stale instance cannot stop listener");
      check(get(port, "/", null).status == 403, "wrong-stop leaves current server protected and alive");
      call(plugin, "stop", new JSONArray().put(port).put(id));
      JSONObject replacement = (JSONObject) call(plugin, "start", new JSONArray().put(port)).value;
      check(!replacement.getString("id").equals(id), "same port receives fresh instance identity");
      check(call(plugin, "stop", new JSONArray().put(port).put(id)).error != null, "old JS cannot stop replacement at same port");
      plugin.onReset();
      boolean closed = false;
      try { get(port, "/", null); } catch (IOException expected) { closed = true; }
      check(closed, "Cordova reset closes old listener");
      for (int index = 0; index < 4; index++) check(call(plugin, "start", new JSONArray().put(0)).error == null, "bounded registry admits allowed listeners");
      CallbackContext limit = call(plugin, "start", new JSONArray().put(0));
      check(((JSONObject) limit.error).getString("code").equals("SERVER_LIMIT"), "fifth listener refused");
      plugin.onReset();
      check(call(plugin, "start", new JSONArray().put(0)).error == null, "fresh WebView lifetime can start after reset");
      plugin.onDestroy();
      check(call(plugin, "start", new JSONArray().put(0)).error != null, "destroyed plugin cannot start another listener");
    } finally { plugin.onDestroy(); }
  }

  private static void testConnectionLimit() throws Exception {
    NanoHTTPDWebserver bounded = new NanoHTTPDWebserver(0, null, 2, 250, 60_000);
    java.util.List<java.net.Socket> sockets = new java.util.ArrayList<>();
    try {
      bounded.start(5000, true);
      for (int index = 0; index < 2; index++) sockets.add(new java.net.Socket("127.0.0.1", bounded.getListeningPort()));
      await(() -> bounded.connectionCount() == 2, "idle TCP clients occupy only the bounded worker set");
      try (java.net.Socket excess = new java.net.Socket("127.0.0.1", bounded.getListeningPort())) {
        excess.setSoTimeout(1000);
        check(excess.getInputStream().read() == -1, "excess TCP connection closes instead of growing workers or queue");
      }
      check(bounded.connectionCount() == 2, "client tracking remains bounded");
      bounded.stop();
      check(bounded.connectionCount() == 0, "stop closes even clients that never sent an HTTP header");
    } finally {
      bounded.stop();
      for (java.net.Socket socket : sockets) socket.close();
    }
  }

  private static void testIndependentSessions() throws Exception {
    NanoHTTPDWebserver first = new NanoHTTPDWebserver(0, null);
    NanoHTTPDWebserver second = new NanoHTTPDWebserver(0, null);
    try {
      first.start(5000, true); second.start(5000, true);
      JSONObject a = first.descriptor(), b = second.descriptor();
      check(!a.getString("token").equals(b.getString("token")), "separate listeners have independent bootstrap capabilities");
      check(!a.getString("id").equals(b.getString("id")), "independent instance fences");
      check(get(second.getListeningPort(), "/?__acode_preview=" + a.getString("token"), null).status == 403, "bootstrap cannot cross server instances");
      check(get(first.getListeningPort(), "//untrusted.invalid/?__acode_preview=" + a.getString("token"), null).status == 403, "bootstrap cannot become a network-path redirect");
      String cookie = bootstrap(first);
      String transplanted = "acode_preview_" + second.getListeningPort() + "=" + cookie.split("=", 2)[1];
      check(get(second.getListeningPort(), "/", transplanted).status == 403, "even a renamed cookie cannot cross instances");
    } finally { first.stop(); second.stop(); }
  }

  private static void testPausedBridgeBackpressure() throws Exception {
    NanoHTTPDWebserver queued = new NanoHTTPDWebserver(0, null, 2, 80, 60_000);
    List<String> messages = new CopyOnWriteArrayList<>();
    AtomicBoolean respond = new AtomicBoolean();
    CallbackContext callback = new CallbackContext();
    callback.listener = event -> {
      if (event.value == null || !event.value.has("requestId")) return;
      String id = event.value.getString("requestId");
      messages.add(id);
      if (respond.get()) queued.completeResponse(id, new JSONObject().put("status", 200).put("body", "resumed"));
    };
    try {
      queued.start(5000, true);
      queued.setRequestHandler(callback);
      int port = queued.getListeningPort();
      String cookie = bootstrap(queued);
      check(get(port, "/one", cookie).status == 503, "paused bridge first request times out");
      check(get(port, "/two", cookie).status == 503, "paused bridge second request times out");
      check(queued.pendingCount() == 0 && queued.dispatchedCount() == 2, "expired futures gone but outbound ticket budget remains bounded");
      check(get(port, "/three", cookie).status == 503 && messages.size() == 2, "backpressure forbids more messages to paused WebView");
      check(!queued.completeResponse(messages.get(0), new JSONObject()), "consuming stale message never accepts its response");
      check(queued.dispatchedCount() == 1, "discard releases one bounded bridge slot");
      respond.set(true);
      check(get(port, "/resumed", cookie).status == 200, "resumed JS can service the next request");
      queued.stop();
      check(queued.dispatchedCount() == 0, "stop clears all delivery tickets");
    } finally { queued.stop(); }
  }
}
