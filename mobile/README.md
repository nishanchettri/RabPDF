# RabPDF for Android

Android preview 0.2.0. All tools are permanently free, with no trial or payments.
PDF processing works offline. Optional AdMob ads use the network separately.

All 16 desktop tools are implemented: page operations, compression, AES-256
protection and authorized unlocking, image conversions, text/image extraction,
watermarks, numbering, metadata, and QR generation. The PDF engine is exported
from the desktop source and executes inside a bundled Pyodide worker. PDF.js
renders PDF pages. Output files can be saved through Android's document picker
or shared with another app. No account or document uploads are required.
Ads are optional at build time; see ADS_SETUP.md. Opening the author website or choosing another app
in the Android share sheet is an explicit user action.

## Development

Requires Node 22 or newer, Python 3.11 or newer, pnpm, Java 21, and Android SDK
API 36 with build tools 36.0.0. The dependencies are development tools; app users
install only the APK or the app from Google Play.

Install Pillow for the build's icon conversion: `python -m pip install Pillow`.

```sh
pnpm install --frozen-lockfile
pnpm prepare:engine
pnpm test
pnpm build
pnpm exec cap sync android
cd android
./gradlew assembleDebug
./gradlew bundleRelease
```

On Windows use `gradlew.bat`. Set `JAVA_HOME` and `ANDROID_HOME` first.
Runtime preparation downloads dependency wheels and checks their SHA-256
hashes. These files are bundled in the app, so runtime Internet access is not
required. Generated files and SDK installations are excluded from Git.

The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.
The release App Bundle is at
`android/app/build/outputs/bundle/release/app-release.aab`. A release must be
signed using your private upload key before submission to Google Play.

## Verification and limits

The previous trial and planned paid unlock have been removed. No ad view,
consent choice, ad availability, payment, or network connection gates tools.
Default builds exclude advertising SDKs. Test and live ad modes are documented
in ADS_SETUP.md. Desktop remains free and ad-free.

This is a preview release. Passing a desktop-browser test or producing an APK
does not prove behavior on every Android phone. Test every tool on real devices
before publishing, including encrypted PDFs, large scanned files, document
providers, screen rotation, low memory, and airplane mode.

- Input files are limited to 128 MB total per operation because the Python
  engine uses memory. Available device memory can impose a lower practical limit.
- Page rendering is limited to 12 million pixels per page; choose lower DPI for
  larger pages.
- The 300 DPI renderer and page layout may have minor pixel differences from the
  desktop PDFium renderer.
- Scanned PDF text is not OCR. Unknown passwords are not recovered.
- Source files and result bytes live in memory while the tool is open. Exported
  share copies stay in the app cache until Android clears it or the user clears
  the app's cache. Saved files remain in the selected destination.
- Updating or closing the app during an operation loses unsaved work.
- MIT source code permits attribution changes in forks; official builds embed
  the author credit and website link.

See `PLAY_STORE_GUIDE.md` for account setup, signing, testing, and publication.
