package com.nishanchettri.rabpdf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
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
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
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
            try {
                int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                getContext().getContentResolver().takePersistableUriPermission(destination, flags);
            } catch (SecurityException ignored) { /* Some providers only grant session access. */ }
            String displayName = call.getString("name");
            try (Cursor cursor = getContext().getContentResolver().query(destination, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) displayName = cursor.getString(0);
            } catch (Exception ignored) { /* Saving succeeded even if metadata is unavailable. */ }
            String location = "Android-selected document location";
            if ("com.android.externalstorage.documents".equals(destination.getAuthority())) {
                String id = DocumentsContract.getDocumentId(destination);
                if (id.startsWith("primary:")) location = "Internal storage / " + id.substring(8).replace("/", " / ");
            }
            response.put("uri", destination.toString());
            response.put("name", displayName);
            response.put("location", location);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Unable to save: " + error.getMessage());
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri", ""));
            if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("Invalid saved document.");
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, getContext().getContentResolver().getType(uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(intent, "Open saved file")); call.resolve();
        } catch (Exception error) { call.reject("Cannot open this file. It may have moved or no viewer is installed."); }
    }

    @PluginMethod
    public void browse(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri", ""));
            if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("Invalid saved document.");
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, uri);
            getActivity().startActivity(intent); call.resolve();
        } catch (Exception error) { call.reject("Unable to open Android's file browser."); }
    }

    @PluginMethod
    public void openLink(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("url", ""));
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null) throw new IllegalArgumentException("Only web links can be opened.");
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve();
        } catch (Exception error) { call.reject("Unable to open this web link."); }
    }
}
