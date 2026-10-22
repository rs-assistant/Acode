package org.apache.cordova;

public class CallbackContext {
    public Object value;
    public String error;

    public void success(Object result) { value = result; }
    public void success() { value = Boolean.TRUE; }
    public void error(String message) { error = message; }
}
