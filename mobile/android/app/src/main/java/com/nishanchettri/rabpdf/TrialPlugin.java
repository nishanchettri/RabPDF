package com.nishanchettri.rabpdf;

import android.content.SharedPreferences;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Trial")
public class TrialPlugin extends Plugin {

    @PluginMethod
    public synchronized void status(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("rabpdf_access", 0);
        long elapsed = SystemClock.elapsedRealtime();
        long wall = System.currentTimeMillis();
        long previous = prefs.getLong("last_wall", wall);
        long previousElapsed = prefs.getLong("last_elapsed", elapsed);
        long effective = TrialClock.effectiveNow(wall, previous, elapsed, previousElapsed);
        long started = prefs.getLong("trial_started", effective);
        prefs.edit().putLong("trial_started", started).putLong("last_wall", effective)
             .putLong("last_elapsed", elapsed).commit();
        long remaining = TrialClock.remaining(started, effective);
        JSObject response = new JSObject();
        response.put("active", remaining > 0);
        response.put("remainingSeconds", remaining / 1000);
        response.put("purchased", false);
        response.put("checkoutConfigured", false);
        call.resolve(response);
    }
}
