# Free RabPDF and optional AdMob banners

All tools are permanently free. No trial, checkout, subscription, or rewarded gate.
The home screen has one 320x50 banner, outside the WebView and document controls.
Tool screens remove the banner. Offline or failed ads never block processing.

Build modes (Android Gradle):

- Default `off`: no advertising SDK or consent SDK bundled.
- `-PrabpdfAdsMode=test`: Google sample App ID and banner unit; no publisher revenue.
- `-PrabpdfAdsMode=live`: owner's supplied AdMob IDs configured in app/build.gradle.

Use only test mode for development. Never click your own live ads. Live mode is
also overridden to Google's test IDs in debug builds; only release builds use
the publisher IDs. The supplied publisher App ID is
`ca-app-pub-3145912084266295~7636986788` and banner ID is
`ca-app-pub-3145912084266295/3262452491`.

Live release mode is
for publication after real-device testing and AdMob account readiness review.
IDs are public identifiers, not credentials. Signing keys remain private.

Before publication:

1. Link the Android app to its Play Store listing in AdMob.
2. Publish applicable messages in AdMob Privacy & messaging, including European
   consent requirements and applicable US-state settings. Fill the privacy URL.
3. Review audience restrictions and SDK settings before targeting children.
4. Publish the reviewed privacy policy with a real support email. Declare ads
   and SDK data behavior in Play Console Data safety; local PDF processing does
   not mean the ad SDK collects no data.
5. Test consent acceptance/rejection, privacy choices, airplane mode, no-fill,
   rotation, screen sizes, and processing on a real phone using test ads.

UMP refreshes consent at launch; ad requests require canRequestAds(). The native
privacy entry point appears when UMP requires it. This does not replace legal
review or correct server-side consent message configuration. No documents,
passwords, QR input, or output files are passed into an ad request.

https://developers.google.com/admob/android/banner
https://developers.google.com/admob/android/privacy
