#!/usr/bin/env bash
# Builds the signed release APK from a clean checkout of a tag and uploads it to the matching
# GitHub release. The APK must be byte-identical to F-Droid's build (reproducible builds): F-Droid
# rebuilds the same commit, checks it matches this APK, and then publishes this signature.
#
#   scripts/release-apk.sh v0.1.0
#
# Needs: android/keystore.properties (git-ignored, see docs/fdroid.md), JAVA_HOME, ANDROID_HOME, gh.
set -euo pipefail

TAG=${1:?usage: scripts/release-apk.sh vX.Y.Z}
ROOT=$(git rev-parse --show-toplevel)
PROPS="$ROOT/android/keystore.properties"
[ -f "$PROPS" ] || { echo "Missing $PROPS" >&2; exit 1; }
: "${ANDROID_HOME:?ANDROID_HOME must be set}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git clone --quiet --branch "$TAG" "$ROOT" "$WORK/src"
cp "$PROPS" "$WORK/src/android/"
echo "sdk.dir=$ANDROID_HOME" > "$WORK/src/android/local.properties"

cd "$WORK/src"
npm ci --silent
npm run build
(cd android && ./gradlew --quiet --console=plain assembleRelease)

OUT="$ROOT/dist/vinted-bundle-search-$TAG.apk"
mkdir -p "$ROOT/dist"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)
"$APKSIGNER" verify --print-certs "$OUT" | grep -i "sha-256"
gh release upload "$TAG" "$OUT" --clobber
echo "Uploaded $OUT"
