package com.nishanchettri.rabpdf;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(ScannerPlugin.class);
        if (BuildConfig.ADS_ENABLED) {
            try {
                registerPlugin(Class.forName("com.nishanchettri.rabpdf.AdsPlugin").asSubclass(com.getcapacitor.Plugin.class));
            } catch (ClassNotFoundException error) {
                throw new IllegalStateException("Ads plugin missing from enabled build", error);
            }
        }
        super.onCreate(savedInstanceState);
    }
}
