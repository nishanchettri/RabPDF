package com.nishanchettri.rabpdf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    @PluginMethod
    public void export(PluginCall call) {
        String source = call.getString("source");
        String name = call.getString("name");
        if (source == null || name == null) {
            call.reject("No result file to save.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri destination = result.getData().getData();
        try {
            Uri sourceUri = Uri.parse(call.getString("source"));
            if (!"file".equals(sourceUri.getScheme())) throw new IllegalArgumentException("Invalid cached result.");
            File source = new File(sourceUri.getPath());
            String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
            if (!source.getCanonicalPath().startsWith(cache)) throw new IllegalArgumentException("Invalid cached result.");
            try (InputStream input = new FileInputStream(source);
                 OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
                if (output == null) throw new IllegalStateException("Cannot open the selected destination.");
                byte[] buffer = new byte[65536];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
            response.put("cancelled", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Unable to save: " + error.getMessage());
        }
    }
}
