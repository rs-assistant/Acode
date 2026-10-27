package com.foxdebug.acode.rk.exec.terminal;

import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ServerHandshake;

/** Actual production ProcessServer + real sockets/WS + disposable /bin/cat only. */
public class ProcessStreamAudit {
    private static int checks;
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }
    private static class Client extends WebSocketClient {
        final BlockingQueue<byte[]> output = new LinkedBlockingQueue<>();
        final CountDownLatch closed = new CountDownLatch(1);
        volatile int closeCode;
        volatile String closeReason = "";
        Client(int port, String path) throws Exception {
            super(new URI("ws://127.0.0.1:" + port + path), new Draft_6455(),
                Map.of("Origin", "https://untrusted.invalid"), 1000);
        }
        public void onOpen(ServerHandshake handshake) {}
        public void onMessage(String text) { output.add(text.getBytes(StandardCharsets.UTF_8)); }
        public void onMessage(ByteBuffer bytes) { byte[] copy = new byte[bytes.remaining()]; bytes.get(copy); output.add(copy); }
        public void onClose(int code, String reason, boolean remote) { closeCode = code; closeReason = reason; closed.countDown(); }
        public void onError(Exception error) { /* Never print endpoint tokens in errors. */ }
        byte[] read(int length) throws Exception {
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (data.size() < length) {
                byte[] chunk = output.poll(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                if (chunk == null) throw new AssertionError("Expected stream output was not received");
                data.write(chunk);
                if (System.nanoTime() >= deadline && data.size() < length) throw new AssertionError("Output timeout");
            }
            return data.toByteArray();
        }
        void echo(String text) throws Exception {
            send(text);
            check(text.equals(new String(read(text.getBytes(StandardCharsets.UTF_8).length), StandardCharsets.UTF_8)), "Authorized text must round trip");
        }
    }
    private static ProcessServer server(AtomicInteger closed, long idle) {
        return new ProcessServer(0, new String[] {"/bin/cat"}, ignored -> closed.incrementAndGet(), idle);
    }
    private static void denied(int port, String path) throws Exception {
        Client client = new Client(port, path);
        try { check(!client.connectBlocking(2, TimeUnit.SECONDS), "Unauthorized handshake must fail"); }
        finally { client.close(); }
    }
    private static Process process(ProcessServer server) throws Exception {
        var field = ProcessServer.class.getDeclaredField("state"); field.setAccessible(true);
        Object state = field.get(server);
        if (state == null) return null;
        var value = state.getClass().getDeclaredField("process"); value.setAccessible(true);
        return (Process) value.get(state);
    }
    public static void main(String[] args) throws Exception {
        AtomicInteger closed = new AtomicInteger();
        ProcessServer server = server(closed, 10000);
        ProcessServer other = server(new AtomicInteger(), 10000);
        Client owner = null;
        try {
            check(server.getToken().matches("[0-9a-f]{64}"), "Require a 256-bit endpoint capability");
            check(!server.getToken().equals(other.getToken()), "Each server must get a new capability");
            server.startAndAwait();
            other.startAndAwait();
            int port = server.getPort();
            check(port > 0 && port < 65536, "Use the port actually bound by the server");
            check(server.getAddress().getAddress().isLoopbackAddress(), "Never bind process sockets to LAN interfaces");
            denied(port, "/");
            denied(port, "/wrong");
            denied(port, "/" + other.getToken());
            denied(port, "/" + server.getToken() + "?extra=1");
            denied(port, "/" + server.getToken() + "/");
            check(process(server) == null, "Rejected handshakes must not create a process");
            check(closed.get() == 0, "Rejected clients must not shut down a waiting server");
            owner = new Client(port, "/" + server.getToken());
            check(owner.connectBlocking(2, TimeUnit.SECONDS), "Correct capability must connect");
            owner.echo("dummy-authorized\n");
            byte[] binary = new byte[] {1, 0, 2, 10};
            owner.send(binary);
            check(java.util.Arrays.equals(binary, owner.read(binary.length)), "Authorized binary must round trip");
            ByteBuffer direct = ByteBuffer.allocateDirect(16);
            direct.put("xxdirect\nyy".getBytes(StandardCharsets.UTF_8)).flip(); direct.position(2); direct.limit(9);
            server.onMessage(server.getConnections().iterator().next(), direct.asReadOnlyBuffer());
            check("direct\n".equals(new String(owner.read(7), StandardCharsets.UTF_8)), "Respect sliced/direct/read-only buffers");
            Client duplicate = new Client(port, "/" + server.getToken());
            try {
                duplicate.connectBlocking(2, TimeUnit.SECONDS);
                check(duplicate.closed.await(2, TimeUnit.SECONDS), "Only one owner may claim a server");
                check(duplicate.closeCode == 1008, "Reject duplicate ownership without a second process");
            } finally { duplicate.close(); }
            denied(port, "/wrong-after-owner");
            owner.echo("dummy-owner-still-alive\n");
            Process child = process(server);
            check(child != null && child.isAlive(), "Disposable process should be live for the owner");
            server.shutdown(); server.shutdown();
            check(server.awaitStopped(3000), "Shutdown must not deadlock a WS worker");
            check(owner.closed.await(2, TimeUnit.SECONDS), "Shutdown closes the authorized socket");
            check(child.waitFor(2, TimeUnit.SECONDS), "Shutdown terminates the owned disposable process");
            check(closed.get() == 1, "Shutdown callback must run exactly once");
            denied(port, "/" + server.getToken());
            try { server.startAndAwait(); throw new AssertionError("A revoked server cannot restart"); }
            catch (java.io.IOException expected) { checks++; }
        } finally {
            if (owner != null) owner.close();
            server.shutdown(); other.shutdown();
            server.awaitStopped(3000); other.awaitStopped(3000);
        }
        ProcessServer idle = server(new AtomicInteger(), 150);
        idle.startAndAwait();
        check(idle.awaitStopped(3000), "Unused endpoints must expire");
        check(process(idle) == null, "Expiry must not spawn a process");
        ProcessServer before = server(new AtomicInteger(), 10000);
        before.shutdown();
        check(before.awaitStopped(3000), "Closing before startup must complete");
        try { before.startAndAwait(); throw new AssertionError("Closed startup must be rejected"); }
        catch (java.io.IOException expected) { checks++; }
        try (ServerSocket busy = new ServerSocket()) {
            busy.bind(new InetSocketAddress("127.0.0.1", 0));
            ProcessServer conflict = new ProcessServer(busy.getLocalPort(), new String[] {"/bin/cat"}, ignored -> {});
            try {
                conflict.startAndAwait(); throw new AssertionError("Occupied port must fail");
            } catch (java.io.IOException expected) { checks++; }
            finally { conflict.shutdown(); check(conflict.awaitStopped(3000), "Bind failure cleanup must complete"); }
        }
        ProcessServer failure = new ProcessServer(0, new String[] {"/missing-acode-dummy-private-command"}, ignored -> {});
        Client failed = null;
        try {
            failure.startAndAwait(); failed = new Client(failure.getPort(), "/" + failure.getToken());
            failed.connectBlocking(2, TimeUnit.SECONDS);
            check(failed.closed.await(2, TimeUnit.SECONDS), "Failed process must close the endpoint");
            check(!failed.closeReason.contains("dummy-private-command"), "Close reasons must not expose arguments");
        } finally { if (failed != null) failed.close(); failure.shutdown(); check(failure.awaitStopped(3000), "Failed process cleanup must complete"); }
        System.out.println(checks + " real-loopback process-stream assertions passed (real WS, disposable cat, no Android device)");
    }
}
