#!/usr/bin/env bash
# Run ON YOUR OWN COMPUTER (needs Java keytool and the GitHub CLI `gh`, logged in).
# Creates one upload keystore per app, stores it as GitHub Actions secrets, and keeps a local backup folder.
# BACK UP the "android-keystores" folder somewhere safe (password manager / encrypted drive). Never commit it.
set -euo pipefail
REPO="${REPO:-ibrahemahmedabdo1-ai/otpprovidersas}"
OUT="${OUT:-android-keystores}"
mkdir -p "$OUT"; chmod 700 "$OUT"
for app in customer support admin; do
  UP=$(echo "$app" | tr a-z A-Z)
  pass=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  ks="$OUT/$app-upload.jks"
  [ -f "$ks" ] && { echo "$ks already exists, skipping $app"; continue; }
  keytool -genkeypair -v -keystore "$ks" -storetype JKS -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$pass" -keypass "$pass" -dname "CN=OTPProvider $app, O=OTPProvider, C=US"
  printf '%s' "$pass" > "$OUT/$app-upload.password"; chmod 600 "$OUT/$app-upload.password" "$ks"
  base64 -w0 "$ks" 2>/dev/null | gh secret set "ANDROID_KEYSTORE_B64_$UP" --repo "$REPO" || base64 "$ks" | tr -d '\n' | gh secret set "ANDROID_KEYSTORE_B64_$UP" --repo "$REPO"
  printf '%s' "$pass" | gh secret set "ANDROID_KEYSTORE_PASSWORD_$UP" --repo "$REPO"
  printf '%s' "upload" | gh secret set "ANDROID_KEY_ALIAS_$UP" --repo "$REPO"
  echo "done: $app"
done
echo "All set. Back up $OUT now, then run the 'Android apps' workflow; signed AABs appear as artifacts named <app>-play-aab."
