package com.foxdebug.acode.rk.exec.terminal;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;

/** One process, one authenticated loopback stream. Not a process sandbox. */
class ProcessServer extends WebSocketServer {
    private static final ScheduledExecutorService EXPIRY = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "acode-process-expiry");
        thread.setDaemon(true);
        return thread;
    });
    private final String[] cmd;
    private final String token;
    private final byte[] resource;
    private final Consumer<ProcessServer> onStopped;
    private final long idleTimeoutMs;
    private final Object lifecycle = new Object();
    private final CountDownLatch ready = new CountDownLatch(1);
    private final CountDownLatch finished = new CountDownLatch(1);
    private final AtomicReference<Exception> startError = new AtomicReference<>();
    private boolean started;
    private volatile boolean stopped;
    private volatile WebSocket owner;
    private volatile ConnState state;
    private ScheduledFuture<?> expiry;

    private static final class ConnState {
        final Process process;
        final InputStream stdout;
        final OutputStream stdin;
        ConnState(Process process) {
            this.process = process;
            this.stdout = process.getInputStream();
            this.stdin = process.getOutputStream();
        }
        void close() {
            process.destroy();
            try { stdin.close(); } catch (IOException ignored) {}
            try { stdout.close(); } catch (IOException ignored) {}
        }
    }

    ProcessServer(int port, String[] cmd, Consumer<ProcessServer> onStopped) {
        this(port, cmd, onStopped, 30000);
    }

    // Package-only timeout injection, never a JavaScript setting.
    ProcessServer(int port, String[] cmd, Consumer<ProcessServer> onStopped, long idleTimeoutMs) {
        super(new InetSocketAddress("127.0.0.1", port), 1);
        if (cmd == null || cmd.length == 0 || idleTimeoutMs <= 0) throw new IllegalArgumentException("Invalid process stream");
        this.cmd = cmd.clone();
        this.onStopped = onStopped;
        this.idleTimeoutMs = idleTimeoutMs;
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder encoded = new StringBuilder(64);
        for (byte value : bytes) encoded.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        token = encoded.toString();
        java.util.Arrays.fill(bytes, (byte) 0);
        resource = ("/" + token).getBytes(StandardCharsets.US_ASCII);
        setReuseAddr(false);
    }

    String getToken() { return token; }

    void startAndAwait() throws Exception {
        synchronized (lifecycle) {
            if (stopped) throw new IOException("Process stream is closed");
            started = true;
            start();
        }
        if (!ready.await(5, TimeUnit.SECONDS) || stopped || startError.get() != null) {
            shutdown();
            throw new IOException("Process stream did not start");
        }
    }

    private boolean authorized(ClientHandshake handshake) {
        String value = handshake.getResourceDescriptor();
        return !stopped && value != null && value.length() == resource.length &&
            MessageDigest.isEqual(resource, value.getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(WebSocket conn, Draft draft, ClientHandshake handshake)
        throws InvalidDataException {
        if (!authorized(handshake)) throw new InvalidDataException(1008, "Process stream authorization required");
        return super.onWebsocketHandshakeReceivedAsServer(conn, draft, handshake);
    }

    @Override public void onStart() {
        synchronized (lifecycle) {
            if (!stopped) expiry = EXPIRY.schedule(() -> {
                if (owner == null) shutdown();
            }, idleTimeoutMs, TimeUnit.MILLISECONDS);
        }
        ready.countDown();
    }

    @Override public void onError(WebSocket conn, Exception error) {
        if (conn == null) { startError.set(error); ready.countDown(); shutdown(); }
    }

    @Override public void onOpen(WebSocket conn, ClientHandshake handshake) {
        synchronized (lifecycle) {
            if (!authorized(handshake) || owner != null) {
                conn.close(1008, "Process stream unavailable");
                return;
            }
            owner = conn;
            if (expiry != null) expiry.cancel(false);
        }
        try {
            ConnState opened = new ConnState(new ProcessBuilder(cmd).redirectErrorStream(true).start());
            synchronized (lifecycle) {
                if (stopped) { opened.close(); return; }
                state = opened;
            }
            Thread reader = new Thread(() -> {
                try {
                    byte[] buffer = new byte[8192];
                    int length;
                    while ((length = opened.stdout.read(buffer)) != -1 && conn.isOpen()) {
                        conn.send(ByteBuffer.wrap(java.util.Arrays.copyOf(buffer, length)));
                    }
                } catch (Exception ignored) {
                } finally { conn.close(1000, "Process exited"); shutdown(); }
            }, "acode-process-output");
            reader.setDaemon(true);
            reader.start();
        } catch (Exception ignored) {
            conn.close(1011, "Failed to start process");
            shutdown();
        }
    }

    @Override public void onMessage(WebSocket conn, ByteBuffer message) {
        ConnState current = state;
        if (stopped || conn != owner || current == null) return;
        try {
            byte[] bytes = new byte[message.remaining()];
            message.duplicate().get(bytes);
            synchronized (current) { current.stdin.write(bytes); current.stdin.flush(); }
        } catch (Exception ignored) { shutdown(); }
    }

    @Override public void onMessage(WebSocket conn, String message) {
        onMessage(conn, ByteBuffer.wrap(message.getBytes(StandardCharsets.UTF_8)));
    }

    @Override public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        // Rejected guesses/duplicate clients must not shut down the owner.
        if (conn == owner) shutdown();
    }

    void shutdown() {
        synchronized (lifecycle) {
            if (stopped) return;
            stopped = true;
            if (expiry != null) expiry.cancel(false);
            ready.countDown();
        }
        ConnState current = state;
        if (current != null) current.close();
        Thread closer = new Thread(() -> {
            try { if (started) stop(1000); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            finally { try { onStopped.accept(this); } finally { finished.countDown(); } }
        }, "acode-process-stop");
        closer.setDaemon(true);
        closer.start();
    }

    boolean awaitStopped(long timeoutMs) throws InterruptedException {
        return finished.await(timeoutMs, TimeUnit.MILLISECONDS);
    }
}
