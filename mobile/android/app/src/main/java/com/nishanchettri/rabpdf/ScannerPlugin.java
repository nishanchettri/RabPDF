package com.nishanchettri.rabpdf;

import android.app.Activity;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Scanner")
public class ScannerPlugin extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        launcher = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pending;
            pending = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK) {
                JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
            }
            GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
            io.execute(() -> {
                List<File> created = new ArrayList<>();
                try {
                    if (scan == null || scan.getPages() == null || scan.getPages().isEmpty()) throw new Exception("No scanned pages returned.");
                    JSArray pages = new JSArray();
                    File folder = new File(getContext().getCacheDir(), "rabpdf-scans");
                    if (!folder.exists() && !folder.mkdirs()) throw new Exception("Cannot create scan cache.");
                    long total = 0;
                    for (GmsDocumentScanningResult.Page page : scan.getPages()) {
                        File target = File.createTempFile("scan-", ".jpg", folder);
                        created.add(target);
                        try (InputStream input = getContext().getContentResolver().openInputStream(page.getImageUri());
                             FileOutputStream output = new FileOutputStream(target)) {
                            if (input == null) throw new Exception("Cannot read scanned page.");
                            byte[] buffer = new byte[65536]; int read; long size = 0;
                            while ((read = input.read(buffer)) != -1) {
                                size += read; total += read;
                                if (size > 20L * 1024 * 1024 || total > 100L * 1024 * 1024) throw new Exception("Scan is too large. Use fewer pages.");
                                output.write(buffer, 0, read);
                            }
                        }
                        pages.put(Uri.fromFile(target).toString());
                    }
                    JSObject response = new JSObject(); response.put("cancelled", false); response.put("pages", pages); call.resolve(response);
                } catch (Exception error) {
                    for (File file : created) file.delete();
                    call.reject("Cannot load scan: " + error.getMessage());
                }
            });
        });
    }

    @PluginMethod
    public void document(PluginCall call) {
        if (pending != null) { call.reject("A scan is already open."); return; }
        int limit = Math.max(1, Math.min(30, call.getInt("limit", 20)));
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true).setPageLimit(limit)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build();
        pending = call;
        getActivity().runOnUiThread(() -> GmsDocumentScanning.getClient(options).getStartScanIntent(getActivity())
            .addOnSuccessListener(sender -> {
                try { launcher.launch(new IntentSenderRequest.Builder(sender).build()); }
                catch (Exception error) { pending = null; call.reject("Cannot open scanner. Import photos instead."); }
            })
            .addOnFailureListener(error -> { pending = null; call.reject("Scanner unavailable. It needs Google Play services, a first-use download, and a supported device. You can import photos instead."); }));
    }

    @PluginMethod
    public void qr(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build();
        getActivity().runOnUiThread(() -> GmsBarcodeScanning.getClient(getContext(), options).startScan()
            .addOnSuccessListener(code -> { JSObject response = new JSObject(); response.put("text", code.getRawValue()); call.resolve(response); })
            .addOnCanceledListener(() -> { JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); })
            .addOnFailureListener(error -> call.reject("QR camera scanner unavailable. Check Google Play services or import a QR image.")));
    }

    @PluginMethod
    public void release(PluginCall call) {
        io.execute(() -> {
            try {
                JSArray paths = call.getArray("paths", new JSArray());
                String root = new File(getContext().getCacheDir(), "rabpdf-scans").getCanonicalPath() + File.separator;
                for (int index = 0; index < paths.length(); index++) {
                    Uri uri = Uri.parse(paths.getString(index));
                    if (!"file".equals(uri.getScheme())) continue;
                    File file = new File(uri.getPath());
                    if (file.getCanonicalPath().startsWith(root)) file.delete();
                }
                call.resolve();
            } catch (Exception error) { call.reject("Cannot clear scan cache."); }
        });
    }

    @Override protected void handleOnDestroy() { io.shutdown(); }
}
