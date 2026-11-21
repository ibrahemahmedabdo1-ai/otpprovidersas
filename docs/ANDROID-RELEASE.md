# Android release (Google Play)

Three apps: customer, support, admin. Package names are `com.otpprovider.<app>`.

## One-time setup
1. On your computer run `scripts/make-android-keystores.sh` (needs `keytool`, `openssl`, `gh`). It creates one **upload** keystore per app, stores them as GitHub secrets and saves a backup in `android-keystores/`. Back that folder up and never commit it.
2. In Play Console create each app and enrol in **Play App Signing** (Google holds the final signing key; you keep only the upload key).
3. Run the **Android apps** workflow (it also runs on every change to `apps/*-mobile`). Download `<app>-play-aab` from the run's artifacts and upload it to the Internal testing track.

## Updates
Each run uses its run number as the Android `versionCode`, so every new AAB is accepted. Change the visible version in each app's `pubspec.yaml` (`version: 1.0.0+1`; the part after `+` is overridden by CI).

## Before a public release
- A privacy policy URL (the website's privacy page) and the Data safety form.
- Store listing: icon (512x512 is in `assets/icon/`), feature graphic, screenshots.
- Customer app: Live sending only after the organization is verified by a Super Admin.
- Without the keystore secrets the workflow still builds debug-signed APKs (testing only, not accepted by Google Play) and produces no AAB.
