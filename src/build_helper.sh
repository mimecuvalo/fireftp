#!/bin/bash

mkdir chrome

cp chrome.manifest.master chrome.manifest

cp -R icons chrome/icons

sed -e s/__l10n__/$FIREFTP_LANG/g \
    -e s/__VERSION__/$FIREFTP_VER/g \
    -e s/__MINVERSION__/$FIREFTP_MIN/g \
    -e s/__MAXVERSION__/$FIREFTP_MAX/g \
    install.rdf.in > install.rdf

sed -e s/__VERSION__/$FIREFTP_VER/g content/js/etc/globals.js.in > content/js/etc/globals.js

rm ../downloads/fireftp_$FIREFTP_LANG.xpi


zip -q -r9 ../downloads/fireftp_$FIREFTP_LANG.xpi \
  content \
  locale/af \
  locale/af-ZA \
  locale/ar \
  locale/ar-SA \
  locale/ast-ES \
  locale/az-AZ \
  locale/be \
  locale/bg \
  locale/bg-BG \
  locale/ca \
  locale/ca-AD \
  locale/cs \
  locale/da \
  locale/de \
  locale/dsb \
  locale/el \
  locale/en-US \
  locale/eo \
  locale/es-AR \
  locale/es-CL \
  locale/es-ES \
  locale/es-MX \
  locale/et \
  locale/eu \
  locale/eu-ES \
  locale/fa \
  locale/fi \
  locale/fr \
  locale/fy-NL \
  locale/ga-IE \
  locale/gl-ES \
  locale/he \
  locale/hr-HR \
  locale/hsb \
  locale/hu \
  locale/hu-HU \
  locale/id \
  locale/it \
  locale/it-IT \
  locale/ja-JP \
  locale/ka-GE \
  locale/km-KH \
  locale/ko-KR \
  locale/lt-LT \
  locale/mn-MN \
  locale/nb-NO \
  locale/nl \
  locale/pl \
  locale/pl-PL \
  locale/pt-BR \
  locale/pt-PT \
  locale/ro \
  locale/ro-RO \
  locale/ru \
  locale/sk \
  locale/sl \
  locale/sr-RS \
  locale/sv-SE \
  locale/tr \
  locale/uk \
  locale/uk-UA \
  locale/vi-VN \
  locale/zh-CN \
  locale/zh-TW \
  skin \
  chrome/icons/default/fireftp-main-window.ico \
  chrome/icons/default/fireftp-main-window.xpm \
  components/nsIFireFTPUtils.xpt \
  components/nsIFireFTPUtils.js \
  components/fireftp-service.js \
  defaults/preferences/fireftp.js \
  chrome.manifest \
  install.rdf \
  license.txt \
  -x "*/CVS/*" "*.in" "*.DS_Store" "*.swp" "*/.git/*" "*.gitignore"

rm -rf chrome
