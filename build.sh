#!/usr/bin/env bash
# Builds store-ready zips for Chrome and Firefox into dist/.
set -euo pipefail
cd "$(dirname "$0")"

GECKO_ID="${GECKO_ID:-duplicate-tab-finder@example.com}" # TODO: set your real add-on ID
GECKO_MIN="140.0"
GECKO_ANDROID_MIN="142.0" # data_collection_permissions needs 142 on Android

VERSION=$(jq -r .version manifest.json)
FILES=(popup.html popup.css popup.js)

rm -rf dist
for target in chrome firefox; do
  out="dist/$target"
  mkdir -p "$out/assets"
  cp "${FILES[@]}" "$out/"
  cp -R assets/icons "$out/assets/"
done

cp manifest.json dist/chrome/manifest.json

jq --arg id "$GECKO_ID" --arg min "$GECKO_MIN" --arg amin "$GECKO_ANDROID_MIN" '. + {
  browser_specific_settings: {
    gecko: {
      id: $id,
      strict_min_version: $min,
      data_collection_permissions: {required: ["none"]}
    },
    gecko_android: {strict_min_version: $amin}
  }
}' manifest.json > dist/firefox/manifest.json

for target in chrome firefox; do
  zip="duplicate-tab-finder-$target-$VERSION.zip"
  (cd "dist/$target" && zip -qr "../$zip" .)
  echo "dist/$zip"
done
