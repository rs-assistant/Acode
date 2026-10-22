package com.foxdebug.sftp;

import android.content.res.Configuration;

/** Keep native security dialogs independent of the activity's white accent. */
final class SftpDialogTheme {
  private SftpDialogTheme() {}

  static int forUiMode(int uiMode) {
    boolean dark = (uiMode & Configuration.UI_MODE_NIGHT_MASK)
      == Configuration.UI_MODE_NIGHT_YES;
    return dark
      ? android.R.style.Theme_Material_Dialog_Alert
      : android.R.style.Theme_Material_Light_Dialog_Alert;
  }
}
