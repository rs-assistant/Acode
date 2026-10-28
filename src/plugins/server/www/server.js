module.exports = function (port, onReady, onError = console.error) {
  let endpoint;
  let handler;
  let stopped = false;
  let registering = false;
  let ready = false;
  const activeRequests = new Map();
  const complete = (requestId, data, success = () => {}, fail = () => {}) => {
    if (stopped || !endpoint) return;
    cordova.exec(success, fail, "Server", "send", [
      endpoint.port,
      endpoint.id,
      requestId,
      data,
    ]);
  };
  const discard = (id) =>
    complete(id, { status: 503, body: "Preview request expired or busy" });
  const isRequestActive = (id) => {
    const now = Date.now();
    for (const [key, deadline] of activeRequests) {
      if (deadline <= now) {
        activeRequests.delete(key);
        discard(key);
      }
    }
    return !stopped && ready && activeRequests.has(id);
  };
  const send = (requestId, data, success = () => {}, fail = () => {}) => {
    if (!isRequestActive(requestId)) return;
    activeRequests.delete(requestId);
    complete(requestId, data, success, fail);
  };
  const error = (reply) => {
    const failure = new Error("Preview operation unavailable");
    const known = [
      "PORT_IN_USE",
      "INVALID_STATE",
      "SERVER_LIMIT",
      "START_FAILED",
      "STALE_PREVIEW",
      "HANDLER_UNAVAILABLE",
      "EXPIRED_REQUEST",
      "UPDATE_REQUIRED",
    ];
    failure.code = known.includes(reply?.code) ? reply.code : "PREVIEW_FAILED";
    onError(failure);
  };
  const stopNative = (success = () => {}, fail = () => {}) => {
    cordova.exec(success, fail, "Server", "stop", [endpoint.port, endpoint.id]);
  };
  const register = () => {
    if (!endpoint || !handler || registering || stopped) return;
    registering = true;
    cordova.exec(
      (message) => {
        if (stopped) return;
        if (message?.event === "ready") {
          if (!ready) {
            ready = true;
            onReady();
          }
        } else if (ready && typeof message?.requestId === "string") {
          isRequestActive(message.requestId);
          if (
            activeRequests.size >= 8 ||
            !Number.isInteger(message.timeoutMs) ||
            message.timeoutMs < 1 ||
            message.timeoutMs > 10_000 ||
            !Number.isSafeInteger(message.expiresAtMs) ||
            message.expiresAtMs <= Date.now()
          ) {
            discard(message.requestId);
            return;
          }
          activeRequests.set(
            message.requestId,
            Math.min(Date.now() + message.timeoutMs, message.expiresAtMs),
          );
          try {
            handler(message);
          } catch {
            send(message.requestId, {
              status: 500,
              body: "Preview unavailable",
            });
          }
        }
      },
      error,
      "Server",
      "setOnRequestHandler",
      [endpoint.port, endpoint.id],
    );
  };
  cordova.exec(
    (reply) => {
      if (
        !reply ||
        !Number.isInteger(reply.port) ||
        reply.port < 1 ||
        reply.port > 65535 ||
        !/^[a-f0-9]{32}$/.test(reply.id) ||
        !/^[a-f0-9]{64}$/.test(reply.token)
      ) {
        error({ code: "UPDATE_REQUIRED" });
        return;
      }
      endpoint = reply;
      if (stopped) stopNative();
      else register();
    },
    error,
    "Server",
    "start",
    [port],
  );
  return {
    stop(success, fail) {
      if (stopped) return;
      stopped = true;
      activeRequests.clear();
      if (endpoint) stopNative(success, fail);
    },
    send,
    isRequestActive,
    setOnRequestHandler(callback) {
      if (registering || stopped) return;
      handler = callback;
      register();
    },
    getUrl(path = "/") {
      if (stopped || !ready) throw new Error("Preview is not ready");
      const url = new URL(path, `http://localhost:${endpoint.port}/`);
      if (url.origin !== `http://localhost:${endpoint.port}`)
        throw new Error("Invalid preview path");
      url.searchParams.set("__acode_preview", endpoint.token);
      return url.href;
    },
    get port() {
      return endpoint?.port ?? port;
    },
  };
};
