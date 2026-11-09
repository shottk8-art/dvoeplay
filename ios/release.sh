#!/bin/bash
# Сборка iPhone-версии сборника для App Store:  ios/release.sh          — подписанный build/export/Games.ipa
#                                                ios/release.sh upload   — сразу загрузить в App Store Connect (TestFlight)
# Перед загрузкой новой сборки: CURRENT_PROJECT_VERSION +1 в project.yml (скрипт сам запускает xcodegen).
#
# Как у «Кубика» (проверено там 15.10.2026): у команды нет зарегистрированных iPhone, поэтому архив делается без подписи,
# а подписывает Xcode при выгрузке (облачная подпись Apple Distribution).
set -euo pipefail
cd "$(dirname "$0")"
DD="${DERIVED_DATA:-build/DerivedData}"

python3 build.py
xcodegen generate
rm -rf build/Games.xcarchive build/export build/upload
xcodebuild -project Games.xcodeproj -scheme Games -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/Games.xcarchive -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO archive -quiet
xattr -cr build/Games.xcarchive   # папка Documents в iCloud: служебные метки файлов мешают подписи («detritus not allowed»)

DEST=export; OUT=build/export
if [ "${1:-}" = "upload" ]; then DEST=upload; OUT=build/upload; fi
mkdir -p build
sed "s|<string>export</string>|<string>$DEST</string>|" ExportOptions.plist > build/ExportOptions-run.plist
xcodebuild -exportArchive -archivePath build/Games.xcarchive -exportPath "$OUT" \
  -exportOptionsPlist build/ExportOptions-run.plist -allowProvisioningUpdates
echo "готово: $OUT"
