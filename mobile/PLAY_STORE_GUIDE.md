# Publishing RabPDF on Google Play

Checked on 2026-10-01. Read the linked Google pages again before submission;
Google can change policies, and your Play Console dashboard is authoritative.

## 1. Create and verify your own developer account

The chosen business model is 24 hours free, then a non-consumable one-time
unlock at a planned US$0.99 base price. No subscription. Configure the app as
free to download with an in-app product. The preview only implements the trial
and expiry screen; Google Play Billing, restore purchases, price localization,
purchase acknowledgement, and verification still need implementation and Play
Console configuration before production. Do not claim checkout works yet.

For the standard Google Play distribution, a digital feature unlock uses Play
Billing unless an applicable policy exception or approved program applies:
https://support.google.com/googleplay/android-developer/answer/9858738

Details of merchant setup, taxes, regional pricing, and transaction verification
are deferred until the owner chooses the payment configuration.

Visit https://play.google.com/console and choose the correct personal or
organization account type. The registration fee is US$25 once. Complete the
identity and contact verification shown in the dashboard. A new personal
account can also require verification using an Android device. Do not choose
an organization account solely to avoid personal-account testing requirements.

Official account setup:
https://support.google.com/googleplay/android-developer/answer/6112435

## 2. Review the app on real devices

Install the APK and test every operation. Use non-sensitive test documents.
Test airplane mode, file selection from Downloads and document providers,
saving results, sharing, password protection and unlocking, large images,
portrait/landscape, and accessibility font settings. A preview build is not an
automatic claim of production readiness or Google approval.

## 3. Keep the package name and signing key

The application ID is `com.nishanchettri.rabpdf`. Check that it is available in
your account before your first submission. Once published, keep the same ID.

Create a private upload key outside the repository:

```sh
keytool -genkeypair -v -keystore rabpdf-upload.jks -alias rabpdf-upload -keyalg RSA -keysize 3072 -validity 10000
```

Choose strong passwords interactively. Back up the key, alias, and passwords
in a secure place. Never upload a keystore, signing password, or service-account
credential to GitHub or put it in the source ZIP. A debug-signed APK is for local
testing and cannot serve as your production upload key.

The Android build uses these environment variables for release signing:

- `RABPDF_KEYSTORE`: absolute path to the upload keystore
- `RABPDF_KEY_ALIAS`: upload key alias
- `RABPDF_STORE_PASSWORD`: keystore password
- `RABPDF_KEY_PASSWORD`: key password

Then run `gradlew.bat bundleRelease` on Windows, or `./gradlew bundleRelease`
on other systems. Without the variables, the release bundle is unsigned and
cannot be uploaded as a production release.

Use Play App Signing during the first upload. Google manages the app signing
key and your upload key authenticates the bundles you upload.
https://support.google.com/googleplay/android-developer/answer/9842756

## 4. Prepare the store listing

Create an app named RabPDF, choose the language, select App rather than Game,
and choose free or paid. Complete:

- Short and full descriptions that match the tested Android build
- A 512 x 512 app icon and a 1024 x 500 feature graphic
- At least two genuine phone screenshots of the Android app
- Support contact email and the website `https://nishanchettri.com`
- App category (Productivity or Tools, as appropriate)

Do not use desktop screenshots as Android screenshots. Review the rights to the
rabbit artwork and third-party libraries before public distribution.

## 5. Complete App content and privacy declarations

Publish a privacy policy at a stable publicly accessible HTTPS URL, for example
`https://nishanchettri.com/rabpdf/privacy`. Providing a file in GitHub is not the
same as making that URL available. The included privacy draft still needs your
real support email and a review of the final build before it is published.

Complete Data safety, the content-rating questionnaire, target audience, ads
declaration, app access, and any other mandatory dashboard items. This build
has no accounts, advertisements, analytics, or remote processing. Do not mark
data as collected merely because a PDF is processed locally; equally, recheck
all declarations if you add analytics, ads, uploads, or crash reporting later.
Declare the behavior of the actual build, not an assumed future architecture.

https://support.google.com/googleplay/android-developer/answer/10787469

## 6. Upload the signed AAB and start testing

Use the internal testing track first. Upload the signed `.aab`, read the
pre-launch report and warnings, and fix real issues. The app targets API 36,
matching the current new-app requirement after August 31, 2026.

https://support.google.com/googleplay/android-developer/answer/11926878

Personal accounts created after November 13, 2023 require a closed test with
at least 12 testers continuously opted in for at least 14 days before applying
for production access. Internal testing does not replace that closed-test
requirement. Google reviews the production-access application; completing the
period does not guarantee approval.

https://support.google.com/googleplay/android-developer/answer/14151465

## 7. Request production access and submit

Answer the production-access questions accurately, complete the dashboard,
select countries, enter release notes, and send the release for review. Google
controls review times and approval. For updates, increment `versionCode`,
preserve your application ID, and sign with the same upload key.

Google Play publication is not performed by the GitHub push or APK build.
