package com.foxdebug.sftp;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.security.GeneralSecurityException;

public class SftpErrorsAudit {
  public static void main(String[] args) {
    String dummy = "dummy-password dummy-passphrase /dummy/private-key sftp://dummy-user:dummy-secret@dummy-host";
    Throwable[] failures = {
      new SocketTimeoutException(dummy), new UnknownHostException(dummy),
      new FileNotFoundException(dummy), new SecurityException(dummy),
      new GeneralSecurityException(dummy), new IOException(dummy),
      new IllegalStateException(dummy, new Exception(dummy)), new Exception(dummy),
      new AssertionError(dummy), null,
      new Exception(dummy) {
        @Override public String getMessage() { throw new AssertionError("Must not read raw message"); }
        @Override public String toString() { throw new AssertionError("Must not stringify exception"); }
      }
    };
    String[] expected = {
      "SSH/SFTP operation timed out", "Could not resolve SSH host", "File is missing or unreadable",
      "SSH/SFTP security operation failed", "SSH/SFTP security operation failed",
      "SSH/SFTP input/output operation failed", "SSH/SFTP operation failed",
      "SSH/SFTP operation failed", "SSH/SFTP operation failed", "SSH/SFTP operation failed",
      "SSH/SFTP operation failed"
    };
    for (int i = 0; i < failures.length; i++) {
      String actual = SftpErrors.message(failures[i]);
      if (!expected[i].equals(actual) || actual.contains("dummy")) {
        throw new AssertionError("Error text is not a fixed safe category");
      }
    }
    System.out.println(failures.length + " native error-sanitization regression assertions passed");
  }
}
