package android.app;
public class Activity {
  public int launched;
  public void startActivity(android.content.Intent intent) { launched++; }
}
