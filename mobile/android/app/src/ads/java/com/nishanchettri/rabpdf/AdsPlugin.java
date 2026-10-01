package com.nishanchettri.rabpdf;

import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.*;
import com.google.android.ump.*;

@CapacitorPlugin(name = "Ads")
public class AdsPlugin extends Plugin {
    private ConsentInformation consent;
    private LinearLayout bannerContainer;
    private TextView privacy;
    private AdView banner;
    private boolean visible;
    private boolean initialized;
    private boolean initializing;

    @PluginMethod public void initialize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (consent != null) { call.resolve(); return; }
            consent = UserMessagingPlatform.getConsentInformation(getContext());
            createContainer();
            consent.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(),
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), error -> {
                    refreshPrivacy(); startAds(); call.resolve();
                }), error -> { refreshPrivacy(); startAds(); call.resolve(); });
        });
    }
    private void createContainer() {
        ViewGroup root = getActivity().findViewById(android.R.id.content);
        View original = root.getChildAt(0);
        root.removeView(original);
        LinearLayout layout = new LinearLayout(getContext());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.addView(original, new LinearLayout.LayoutParams(-1, 0, 1));
        privacy = new TextView(getContext());
        privacy.setText("Ad privacy choices");
        privacy.setTextSize(12); privacy.setPadding(16, 8, 16, 8);
        privacy.setVisibility(View.GONE);
        privacy.setOnClickListener(view -> {
            destroyBanner();
            UserMessagingPlatform.showPrivacyOptionsForm(getActivity(), error -> {
                refreshPrivacy(); startAds();
            });
        });
        layout.addView(privacy, new LinearLayout.LayoutParams(-1, -2));
        bannerContainer = new LinearLayout(getContext());
        bannerContainer.setGravity(android.view.Gravity.CENTER);
        bannerContainer.setVisibility(View.GONE);
        layout.addView(bannerContainer, new LinearLayout.LayoutParams(-1, -2));
        root.addView(layout, new ViewGroup.LayoutParams(-1, -1));
    }
    private void refreshPrivacy() {
        privacy.setVisibility(consent.getPrivacyOptionsRequirementStatus() ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED ? View.VISIBLE : View.GONE);
    }
    private void startAds() {
        if (!visible || consent == null || !consent.canRequestAds()) return;
        if (initialized) { loadBanner(); return; }
        if (initializing) return;
        initializing = true;
        MobileAds.initialize(getContext(), status -> getActivity().runOnUiThread(() -> {
            initializing = false; initialized = true; loadBanner();
        }));
    }
    private void loadBanner() {
        if (!visible || banner != null || !consent.canRequestAds()) return;
        banner = new AdView(getContext());
        banner.setAdSize(AdSize.BANNER);
        banner.setAdUnitId(getContext().getString(R.string.admob_banner_id));
        AdView requestedBanner = banner;
        banner.setAdListener(new AdListener() {
            @Override public void onAdLoaded() {
                if (banner != requestedBanner) return;
                bannerContainer.setVisibility(visible ? View.VISIBLE : View.GONE);
            }
            @Override public void onAdFailedToLoad(LoadAdError error) {
                if (banner != requestedBanner) return;
                bannerContainer.setVisibility(View.GONE);
                destroyBanner();
            }
        });
        bannerContainer.addView(banner);
        banner.loadAd(new AdRequest.Builder().build());
    }
    private void destroyBanner() {
        if (banner != null) { banner.destroy(); banner = null; }
        if (bannerContainer != null) { bannerContainer.removeAllViews(); bannerContainer.setVisibility(View.GONE); }
    }
    @PluginMethod public void visibility(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            visible = call.getBoolean("visible", false);
            if (visible) startAds(); else destroyBanner();
            call.resolve();
        });
    }
    @Override protected void handleOnPause() { if (banner != null) banner.pause(); }
    @Override protected void handleOnResume() { if (banner != null) banner.resume(); }
    @Override protected void handleOnDestroy() { destroyBanner(); }
}
