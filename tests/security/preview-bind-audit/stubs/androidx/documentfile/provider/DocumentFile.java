package androidx.documentfile.provider;
import android.content.Context;
import android.net.Uri;
public class DocumentFile {
  public static DocumentFile fromFile(java.io.File file) { throw new AssertionError("File serving not under test"); }
  public static DocumentFile fromSingleUri(Context context, Uri uri) { throw new AssertionError("File serving not under test"); }
  public long length() { throw new AssertionError("File serving not under test"); }
  public long lastModified() { throw new AssertionError("File serving not under test"); }
  public Uri getUri() { throw new AssertionError("File serving not under test"); }
}
