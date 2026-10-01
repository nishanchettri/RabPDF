package com.nishanchettri.rabpdf;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(TrialPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
