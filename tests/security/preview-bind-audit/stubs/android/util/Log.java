package android.util;
public class Log {
  public static int d(String tag, String message) { throw new AssertionError("Unexpected Android logging"); }
  public static int w(String tag, String message, Throwable error) { throw new AssertionError("Unexpected Android logging"); }
}
