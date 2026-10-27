import com.foxdebug.server.NanoHTTPDWebserver;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Real production constructor + NanoHTTPD sockets; Android/file handling is not exercised. */
public final class PreviewBindAudit {
  private static int assertions;

  private static void check(boolean value, String description) {
    if (!value) throw new AssertionError(description);
    assertions++;
  }

  public static void main(String[] args) throws Exception {
    NanoHTTPDWebserver server = new NanoHTTPDWebserver(0, null) {
      @Override public Response serve(IHTTPSession session) {
        return newFixedLengthResponse("dummy preview");
      }
    };
    try (ServerSocket listener = new ServerSocket()) {
      server.setServerSocketFactory(() -> listener);
      try {
        check("127.0.0.1".equals(server.getHostname()), "explicit IPv4 loopback hostname");
        server.start(2000, true);
        check(listener.isBound(), "real server socket is bound");
        check(listener.getInetAddress().isLoopbackAddress(), "bound address is loopback");
        check(!listener.getInetAddress().isAnyLocalAddress(), "no wildcard bind");
        check("127.0.0.1".equals(listener.getInetAddress().getHostAddress()), "exact bound address");
        int port = server.getListeningPort();
        check(port > 0 && port == listener.getLocalPort(), "OS-selected port is used");
        for (String host : new String[] {"127.0.0.1", "localhost"}) {
          HttpURLConnection request = (HttpURLConnection) new URI("http", null, host, port, "/dummy", null, null)
              .toURL().openConnection(Proxy.NO_PROXY);
          request.setConnectTimeout(2000);
          request.setReadTimeout(2000);
          try {
            check(request.getResponseCode() == 200, "local HTTP status");
            try (var body = request.getInputStream()) {
              check("dummy preview".equals(new String(body.readAllBytes(), StandardCharsets.UTF_8)), "local HTTP body");
            }
          } finally { request.disconnect(); }
        }
        int nonLoopback = 0;
        for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
          if (!nic.isUp()) continue;
          for (InetAddress address : Collections.list(nic.getInetAddresses())) {
            if (!(address instanceof Inet4Address) || address.isLoopbackAddress() || address.isAnyLocalAddress()) continue;
            try (Socket remote = new Socket()) {
              boolean connected = false;
              try {
                remote.connect(new InetSocketAddress(address, port), 1000);
                connected = true;
              } catch (java.io.IOException expected) { /* No listener on the LAN interface. */ }
              check(!connected, "non-loopback interface does not accept preview connections");
              nonLoopback++;
            }
          }
        }
        if (nonLoopback == 0) System.out.println("SKIP non-loopback connection check: no active IPv4 interface");
        else System.out.println("Rejected connections on " + nonLoopback + " non-loopback IPv4 interface(s)");
      } finally { server.stop(); }
      check(listener.isClosed(), "stop closes listener");
    }
    System.out.println(assertions + " preview-bind assertions passed (real NanoHTTPD/socket, stubbed Android, dummy response)");
  }
}
