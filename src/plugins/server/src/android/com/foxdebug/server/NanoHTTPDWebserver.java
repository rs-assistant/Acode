package com.foxdebug.server;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Log;
import androidx.documentfile.provider.DocumentFile;
import fi.iki.elonen.NanoHTTPD;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.PluginResult;
import org.json.JSONException;
import org.json.JSONObject;

public class NanoHTTPDWebserver extends NanoHTTPD {

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final ScheduledThreadPoolExecutor REAPER =
    new ScheduledThreadPoolExecutor(1, task -> {
      Thread thread = new Thread(task, "acode-preview-expiry");
      thread.setDaemon(true);
      return thread;
    });

  static {
    REAPER.setRemoveOnCancelPolicy(true);
  }

  private static final String BOOTSTRAP_PARAM = "__acode_preview";
  private final Object state = new Object();

  private static final class PendingResponse {

    final CompletableFuture<JSONObject> future = new CompletableFuture<>();
    final long deadline;

    PendingResponse(long timeoutMillis) {
      deadline =
        System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
    }
  }

  private final Map<String, PendingResponse> pending = new HashMap<>();
  // Bounded IDs remain until JS consumes/discards them, even after HTTP timeout.
  // Otherwise a paused WebView can accumulate unlimited outbound bridge messages.
  private final Set<String> dispatched = new HashSet<>();
  private final Context context;
  private final String instanceId = randomHex(16);
  private final String bootstrapToken = randomHex(32);
  private final String cookieToken = randomHex(32);
  private final int maxPending;
  private final long requestTimeoutMillis;
  private final long idleTimeoutMillis;
  private final BoundedRunner runner;
  private CallbackContext requestCallback;
  private boolean closed;
  private boolean bootstrapUsed;
  private final long createdAt = System.nanoTime();
  private volatile long lastUse = createdAt;
  private ScheduledFuture<?> expiry;

  public NanoHTTPDWebserver(int port, Context context) {
    this(port, context, 8, 10_000, 15 * 60_000);
  }

  NanoHTTPDWebserver(
    int port,
    Context context,
    int maxPending,
    long requestTimeoutMillis,
    long idleTimeoutMillis
  ) {
    // This private preview is intentionally unavailable to other LAN devices.
    super("127.0.0.1", port);
    if (
      maxPending < 1 || requestTimeoutMillis < 1 || idleTimeoutMillis < 1
    ) throw new IllegalArgumentException("Invalid preview limits");
    this.context = context;
    this.maxPending = maxPending;
    this.requestTimeoutMillis = requestTimeoutMillis;
    this.idleTimeoutMillis = idleTimeoutMillis;
    this.runner = new BoundedRunner(maxPending);
    setAsyncRunner(runner);
    synchronized (state) {
      expiry = REAPER.scheduleWithFixedDelay(
        () -> {
          if (
            TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - lastUse) >=
            idleTimeoutMillis
          ) stop();
        },
        idleTimeoutMillis,
        Math.min(idleTimeoutMillis, 30_000),
        TimeUnit.MILLISECONDS
      );
    }
  }

  @Override
  public void start(int timeout, boolean daemon) throws IOException {
    synchronized (state) {
      if (closed) throw new IOException("Preview stopped");
      super.start(timeout, daemon);
    }
  }

  private static String randomHex(int bytes) {
    byte[] buffer = new byte[bytes];
    RANDOM.nextBytes(buffer);
    StringBuilder value = new StringBuilder(bytes * 2);
    for (byte item : buffer)
      value.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
    return value.toString();
  }

  private static boolean matches(String expected, String actual) {
    return (
      actual != null &&
      actual.length() == expected.length() &&
      MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.US_ASCII),
        actual.getBytes(StandardCharsets.US_ASCII)
      )
    );
  }

  public JSONObject descriptor() throws JSONException {
    synchronized (state) {
      if (closed) throw new IllegalStateException("Preview stopped");
      return new JSONObject()
        .put("port", getListeningPort())
        .put("id", instanceId)
        .put("token", bootstrapToken);
    }
  }

  public boolean owns(String id) {
    return matches(instanceId, id);
  }

  public boolean isClosed() {
    synchronized (state) {
      return closed;
    }
  }

  public boolean setRequestHandler(CallbackContext callback) {
    synchronized (state) {
      if (closed || requestCallback != null) return false;
      requestCallback = callback;
      try {
        PluginResult ready = new PluginResult(
          PluginResult.Status.OK,
          new JSONObject().put("event", "ready")
        );
        ready.setKeepCallback(true);
        callback.sendPluginResult(ready);
        return true;
      } catch (Exception error) {
        requestCallback = null;
        return false;
      }
    }
  }

  public boolean completeResponse(String id, JSONObject response) {
    synchronized (state) {
      dispatched.remove(id);
      PendingResponse waiting = pending.get(id);
      if (
        closed || waiting == null || System.nanoTime() - waiting.deadline >= 0
      ) return false;
      return waiting.future.complete(response);
    }
  }

  int pendingCount() {
    synchronized (state) {
      return pending.size();
    }
  }

  int connectionCount() {
    return runner.clients.size();
  }

  int dispatchedCount() {
    synchronized (state) {
      return dispatched.size();
    }
  }

  @Override
  public void stop() {
    CallbackContext callback;
    synchronized (state) {
      if (closed) return;
      closed = true;
      callback = requestCallback;
      requestCallback = null;
      for (PendingResponse waiting : pending.values())
        waiting.future.complete(null);
      pending.clear();
      dispatched.clear();
      if (expiry != null) expiry.cancel(false);
    }
    runner.closeAll();
    super.stop();
    if (callback != null) {
      try {
        callback.sendPluginResult(
          new PluginResult(PluginResult.Status.NO_RESULT)
        );
      } catch (RuntimeException ignored) {
        /* Never log request URLs or cookies. */
      }
    }
  }

  private final class BoundedRunner implements AsyncRunner {

    private final Set<ClientHandler> clients = ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers;
    private boolean stopped;

    BoundedRunner(int limit) {
      workers = new ThreadPoolExecutor(
        limit,
        limit,
        30,
        TimeUnit.SECONDS,
        new SynchronousQueue<>(),
        task -> {
          Thread thread = new Thread(task, "acode-preview-client");
          thread.setDaemon(true);
          return thread;
        }
      );
      workers.allowCoreThreadTimeOut(true);
    }

    @Override
    public synchronized void exec(ClientHandler client) {
      if (stopped) {
        client.close();
        return;
      }
      clients.add(client);
      try {
        workers.execute(client);
      } catch (RejectedExecutionException busy) {
        clients.remove(client);
        client.close();
      }
    }

    @Override
    public void closed(ClientHandler client) {
      clients.remove(client);
    }

    @Override
    public synchronized void closeAll() {
      stopped = true;
      for (ClientHandler client : clients) client.close();
      clients.clear();
      workers.shutdownNow();
    }
  }

  /**
   * Create a request object
   * <p>
   * [ "requestId": requestUUID, " body": request.jsonObject ?? "", " headers":
   * request.headers, " method": request.method, " path": request.url.path, "
   * query": request.url.query ?? "" ]
   *
   * @param session
   * @return
   */
  private JSONObject createJSONRequest(
    String requestId,
    IHTTPSession session,
    PendingResponse waiting
  ) throws JSONException {
    JSONObject jsonRequest = new JSONObject();
    jsonRequest.put("requestId", requestId);
    jsonRequest.put("timeoutMs", requestTimeoutMillis);
    jsonRequest.put(
      "expiresAtMs",
      System.currentTimeMillis() +
        Math.max(
          0,
          TimeUnit.NANOSECONDS.toMillis(waiting.deadline - System.nanoTime())
        )
    );
    jsonRequest.put("body", "");
    Map<String, String> headers = new HashMap<>(session.getHeaders());
    headers.remove("cookie");
    headers.remove("authorization");
    headers.remove("referer");
    jsonRequest.put("headers", new JSONObject(headers));
    jsonRequest.put("method", session.getMethod());
    jsonRequest.put("path", session.getUri());
    jsonRequest.put("query", session.getQueryParameterString());
    return jsonRequest;
  }

  private String getContentType(JSONObject responseObject)
    throws JSONException {
    if (
      responseObject.has("headers") &&
      responseObject.getJSONObject("headers").has("Content-Type")
    ) {
      return responseObject.getJSONObject("headers").getString("Content-Type");
    } else {
      return "text/plain";
    }
  }

  private Response newFixedFileResponse(DocumentFile file, String mime)
    throws FileNotFoundException, IOException {
    Response res;
    res = newFixedLengthResponse(
      Response.Status.OK,
      mime,
      getInputStream(file),
      file.length()
    );
    res.addHeader("Accept-Ranges", "bytes");
    return res;
  }

  Response serveFile(
    Map<String, String> header,
    DocumentFile file,
    String mime
  ) {
    Response res;
    try {
      // Calculate etag
      long fileLen = file.length();
      String path = file.getUri().toString();
      String etag = Integer.toHexString(
        (path + file.lastModified() + "" + fileLen).hashCode()
      );

      // Support (simple) skipping:
      long startFrom = 0;
      long endAt = -1;
      String range = header.get("range");
      if (range != null) {
        if (range.startsWith("bytes=")) {
          range = range.substring("bytes=".length());
          int minus = range.indexOf('-');
          try {
            if (minus > 0) {
              startFrom = Long.parseLong(range.substring(0, minus));
              endAt = Long.parseLong(range.substring(minus + 1));
            }
          } catch (NumberFormatException error) {
            Log.w(
              "NanoHTTPDWebserver",
              "Invalid range header: " + range,
              error
            );
          }
        }
      }

      // get if-range header. If present, it must match etag or else we
      // should ignore the range request
      String ifRange = header.get("if-range");
      boolean headerIfRangeMissingOrMatching = (ifRange == null ||
        etag.equals(ifRange));

      String ifNoneMatch = header.get("if-none-match");
      boolean headerIfNoneMatchPresentAndMatching =
        ifNoneMatch != null &&
        ("*".equals(ifNoneMatch) || ifNoneMatch.equals(etag));

      if (
        headerIfRangeMissingOrMatching &&
        range != null &&
        startFrom >= 0 &&
        startFrom < fileLen
      ) {
        // range request that matches current etag
        // and the startFrom of the range is satisfiable
        if (headerIfNoneMatchPresentAndMatching) {
          // range request that matches current etag
          // and the startFrom of the range is satisfiable
          // would return range from file
          // respond with not-modified
          res = newFixedLengthResponse(Response.Status.NOT_MODIFIED, mime, "");
          res.addHeader("ETag", etag);
        } else {
          if (endAt < 0) {
            endAt = fileLen - 1;
          }
          long newLen = endAt - startFrom + 1;
          if (newLen < 0) {
            newLen = 0;
          }

          InputStream is = getInputStream(file);
          is.skip(startFrom);

          res = newFixedLengthResponse(
            Response.Status.PARTIAL_CONTENT,
            mime,
            is,
            newLen
          );
          res.addHeader("Accept-Ranges", "bytes");
          res.addHeader("Content-Length", "" + newLen);

          String contentRange =
            "bytes " + startFrom + "-" + endAt + "/" + fileLen;
          res.addHeader("Content-Range", contentRange);
          res.addHeader("ETag", etag);
        }
      } else {
        if (
          headerIfRangeMissingOrMatching &&
          range != null &&
          startFrom >= fileLen
        ) {
          // return the size of the file
          // 4xx responses are not trumped by if-none-match
          res = newFixedLengthResponse(
            Response.Status.RANGE_NOT_SATISFIABLE,
            NanoHTTPD.MIME_PLAINTEXT,
            ""
          );
          res.addHeader("Content-Range", "bytes */" + fileLen);
          res.addHeader("ETag", etag);
        } else if (range == null && headerIfNoneMatchPresentAndMatching) {
          // full-file-fetch request
          // would return entire file
          // respond with not-modified
          res = newFixedLengthResponse(Response.Status.NOT_MODIFIED, mime, "");
          res.addHeader("ETag", etag);
        } else if (
          !headerIfRangeMissingOrMatching && headerIfNoneMatchPresentAndMatching
        ) {
          // range request that doesn't match current etag
          // would return entire (different) file
          // respond with not-modified

          res = newFixedLengthResponse(Response.Status.NOT_MODIFIED, mime, "");
          res.addHeader("ETag", etag);
        } else {
          // supply the file
          res = newFixedFileResponse(file, mime);
          res.addHeader("Content-Length", "" + fileLen);
          res.addHeader("ETag", etag);
        }
      }
    } catch (Exception e) {
      if (e instanceof FileNotFoundException) res = newFixedLengthResponse(
        Response.Status.NOT_FOUND,
        NanoHTTPD.MIME_PLAINTEXT,
        "File not found"
      );
      else res = newFixedLengthResponse(
        Response.Status.FORBIDDEN,
        NanoHTTPD.MIME_PLAINTEXT,
        "File unavailable"
      );
    }

    return res;
  }

  @Override
  public Response serve(IHTTPSession session) {
    Response response;
    try {
      response = authorizeAndServe(session);
    } catch (Exception error) {
      response = failure(
        Response.Status.SERVICE_UNAVAILABLE,
        "Preview unavailable"
      );
    }
    response.addHeader("Cache-Control", "no-store");
    response.addHeader("Referrer-Policy", "no-referrer");
    if (session.getMethod() == Method.HEAD) {
      // NanoHTTPD 2.3.1 still writes fixed-length HEAD streams. Retain metadata,
      // close the real stream and prevent both payload and empty gzip emission.
      try {
        if (response.getData() != null) response.getData().close();
      } catch (IOException ignored) {
        /* Static response only; do not log paths. */
      }
      response.setData(new ByteArrayInputStream(new byte[0]));
    }
    return response;
  }

  @Override
  protected boolean useGzipWhenAccepted(Response response) {
    return (
      response.getRequestMethod() != Method.HEAD &&
      super.useGzipWhenAccepted(response)
    );
  }

  private Response failure(Response.Status status, String message) {
    return newFixedLengthResponse(status, MIME_PLAINTEXT, message);
  }

  private String cookieName() {
    return "acode_preview_" + getListeningPort();
  }

  private boolean validCookie(String header) {
    if (header == null || header.length() > 16_384) return false;
    String value = null;
    for (String part : header.split(";")) {
      String[] pair = part.trim().split("=", 2);
      if (pair.length == 2 && pair[0].equals(cookieName())) {
        if (value != null) return false;
        value = pair[1];
      }
    }
    return matches(cookieToken, value);
  }

  private Response authorizeAndServe(IHTTPSession session) throws Exception {
    Map<String, String> headers = session.getHeaders();
    String host = headers.get("host");
    if (
      !("localhost:" + getListeningPort()).equals(host) &&
      !("127.0.0.1:" + getListeningPort()).equals(host)
    ) {
      return failure(Response.Status.FORBIDDEN, "Preview access denied");
    }
    String origin = headers.get("origin");
    String site = headers.get("sec-fetch-site");
    if (
      (origin != null && !("http://" + host).equals(origin)) ||
      (site != null && !site.equals("same-origin") && !site.equals("none"))
    ) {
      return failure(Response.Status.FORBIDDEN, "Preview access denied");
    }
    if (
      session.getMethod() != Method.GET && session.getMethod() != Method.HEAD
    ) {
      Response denied = failure(
        Response.Status.METHOD_NOT_ALLOWED,
        "Read-only preview"
      );
      denied.addHeader("Allow", "GET, HEAD");
      return denied;
    }
    synchronized (state) {
      if (closed) return failure(
        Response.Status.SERVICE_UNAVAILABLE,
        "Preview stopped"
      );
    }
    java.util.List<String> tokens = session
      .getParameters()
      .get(BOOTSTRAP_PARAM);
    if (tokens != null) {
      synchronized (state) {
        if (
          closed ||
          bootstrapUsed ||
          session.getMethod() != Method.GET ||
          tokens.size() != 1 ||
          TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - createdAt) >= 30 ||
          !matches(bootstrapToken, tokens.get(0))
        ) {
          return failure(Response.Status.FORBIDDEN, "Preview access denied");
        }
        String query = session.getQueryParameterString();
        StringBuilder cleanQuery = new StringBuilder();
        for (String part : (query == null ? "" : query).split("&")) {
          if (
            part.isEmpty() ||
            URLDecoder.decode(part.split("=", 2)[0], "UTF-8").equals(
              BOOTSTRAP_PARAM
            )
          ) continue;
          if (cleanQuery.length() > 0) cleanQuery.append('&');
          cleanQuery.append(part);
        }
        String location = new java.net.URI(
          null,
          null,
          session.getUri(),
          null
        ).toASCIIString();
        if (
          !location.startsWith("/") ||
          location.startsWith("//") ||
          location.indexOf('\\') >= 0 ||
          cleanQuery.indexOf("\r") >= 0 ||
          cleanQuery.indexOf("\n") >= 0
        ) {
          return failure(Response.Status.FORBIDDEN, "Preview access denied");
        }
        if (cleanQuery.length() > 0) location += "?" + cleanQuery;
        bootstrapUsed = true;
        lastUse = System.nanoTime();
        Response redirect = failure(Response.Status.REDIRECT_SEE_OTHER, "");
        redirect.addHeader("Location", location);
        redirect.addHeader(
          "Set-Cookie",
          cookieName() +
            "=" +
            cookieToken +
            "; Path=/; HttpOnly; SameSite=Strict"
        );
        return redirect;
      }
    }
    if (!validCookie(headers.get("cookie"))) return failure(
      Response.Status.FORBIDDEN,
      "Preview access denied"
    );

    String requestId = UUID.randomUUID().toString();
    PendingResponse waiting = new PendingResponse(requestTimeoutMillis);
    CallbackContext callback;
    synchronized (state) {
      if (closed || requestCallback == null) return failure(
        Response.Status.SERVICE_UNAVAILABLE,
        "Preview unavailable"
      );
      if (
        pending.size() >= maxPending || dispatched.size() >= maxPending
      ) return failure(Response.Status.SERVICE_UNAVAILABLE, "Preview busy");
      pending.put(requestId, waiting);
      dispatched.add(requestId);
      callback = requestCallback;
      lastUse = System.nanoTime();
    }
    JSONObject responseObject;
    try {
      PluginResult request = new PluginResult(
        PluginResult.Status.OK,
        createJSONRequest(requestId, session, waiting)
      );
      request.setKeepCallback(true);
      callback.sendPluginResult(request);
      long remaining = waiting.deadline - System.nanoTime();
      if (remaining <= 0) throw new java.util.concurrent.TimeoutException();
      responseObject = waiting.future.get(remaining, TimeUnit.NANOSECONDS);
      if (responseObject == null) return failure(
        Response.Status.SERVICE_UNAVAILABLE,
        "Preview stopped"
      );
    } catch (java.util.concurrent.TimeoutException timeout) {
      return failure(
        Response.Status.SERVICE_UNAVAILABLE,
        "Preview response timed out"
      );
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      return failure(Response.Status.SERVICE_UNAVAILABLE, "Preview stopped");
    } finally {
      synchronized (state) {
        pending.remove(requestId);
      }
    }
    return renderResponse(session, responseObject);
  }

  private Response renderResponse(
    IHTTPSession session,
    JSONObject responseObject
  ) {
    Response response = null;

    if (responseObject.has("path")) {
      try {
        String path = responseObject.getString("path");
        DocumentFile file = getFile(path);
        String mimeType = URLConnection.guessContentTypeFromName(path);
        Response res = serveFile(session.getHeaders(), file, mimeType);
        JSONObject headers = getJSONObject(responseObject, "headers");
        // JSONObject headers = responseObject.getJSONObject("headers");
        if (headers != null) {
          Iterator<String> keys = headers.keys();
          while (keys.hasNext()) {
            String key = (String) keys.next();
            res.addHeader(
              key,
              responseObject.getJSONObject("headers").getString(key)
            );
          }
        }
        return res;
      } catch (JSONException e) {
        return failure(
          Response.Status.INTERNAL_ERROR,
          "Invalid preview response"
        );
      }
    } else {
      try {
        response = newFixedLengthResponse(
          Response.Status.lookup(responseObject.getInt("status")),
          getContentType(responseObject),
          responseObject.getString("body")
        );

        JSONObject responseHeaders = responseObject.optJSONObject("headers");
        Iterator<?> keys =
          responseHeaders == null
            ? java.util.Collections.emptyIterator()
            : responseHeaders.keys();
        while (keys.hasNext()) {
          String key = (String) keys.next();
          response.addHeader(key, responseHeaders.getString(key));
        }
      } catch (JSONException e) {
        return failure(
          Response.Status.INTERNAL_ERROR,
          "Invalid preview response"
        );
      }
      return response;
    }
  }

  private DocumentFile getFile(String filePath) {
    Uri fileUri = Uri.parse(filePath);
    DocumentFile documentFile = null;
    if (filePath.matches("file:///(.*)")) {
      File file = new File(fileUri.getPath());
      documentFile = DocumentFile.fromFile(file);
    } else {
      documentFile = DocumentFile.fromSingleUri(
        this.context,
        Uri.parse(filePath)
      );
    }

    return documentFile;
  }

  private InputStream getInputStream(DocumentFile file)
    throws FileNotFoundException, IOException {
    Uri uri = file.getUri();
    ContentResolver contentResolver = context.getContentResolver();
    return contentResolver.openInputStream(uri);
  }

  private JSONObject getJSONObject(JSONObject ob, String key) {
    return ob.optJSONObject(key);
  }
}
