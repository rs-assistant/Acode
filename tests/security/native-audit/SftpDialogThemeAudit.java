package com.foxdebug.sftp;

import android.content.res.Configuration;

public class SftpDialogThemeAudit {
  public static void main(String[] args) {
    int[] modes = {
      Configuration.UI_MODE_NIGHT_NO,
      Configuration.UI_MODE_NIGHT_YES,
      Configuration.UI_MODE_NIGHT_UNDEFINED,
      Configuration.UI_MODE_NIGHT_NO | 0x01,
      Configuration.UI_MODE_NIGHT_YES | 0x02,
      Configuration.UI_MODE_NIGHT_UNDEFINED | 0x01
    };
    int light = android.R.style.Theme_Material_Light_Dialog_Alert;
    int dark = android.R.style.Theme_Material_Dialog_Alert;
    int[] expected = { light, dark, light, light, dark, light };
    for (int i = 0; i < modes.length; i++) {
      if (SftpDialogTheme.forUiMode(modes[i]) != expected[i]) {
        throw new AssertionError("Security dialog must select an explicit native day/night theme");
      }
    }
    System.out.println(modes.length + " native dialog-theme selection assertions passed (no UI rendering)");
  }
}
