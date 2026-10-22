package com.foxdebug.sftp;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.security.GeneralSecurityException;

/** Never expose library/server exception text, causes or stack traces to JS. */
final class SftpErrors {
  private SftpErrors() {}

  static String message(Throwable error) {
    if (error instanceof SocketTimeoutException) return "SSH/SFTP operation timed out";
    if (error instanceof UnknownHostException) return "Could not resolve SSH host";
    if (error instanceof FileNotFoundException) return "File is missing or unreadable";
    if (error instanceof SecurityException || error instanceof GeneralSecurityException) {
      return "SSH/SFTP security operation failed";
    }
    if (error instanceof IOException) return "SSH/SFTP input/output operation failed";
    return "SSH/SFTP operation failed";
  }
}
