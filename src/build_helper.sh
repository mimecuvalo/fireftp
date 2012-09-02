#!/bin/bash

mkdir chrome

if [ $FIREFTP_MASTER -eq 1 ]
then
	cp chrome.manifest.master chrome.manifest
else
	sed -e s/__l10n__/$FIREFTP_LANG/g chrome.manifest.in > chrome.manifest
fi

cp -R icons chrome/icons

if [ $FIREFTP_MASTER -eq 1 ]
then
	sed -e s/__l10n__/$FIREFTP_LANG/g \
			-e s/__VERSION__/$FIREFTP_VER/g \
			-e s/__MINVERSION__/$FIREFTP_MIN/g \
			-e s/__MAXVERSION__/$FIREFTP_MAX/g \
			install.rdf.master > install.rdf
else
	if [ $FIREFTP_LANG = "en-US" ]
	then
		sed -e s/__l10n__/$FIREFTP_LANG/g \
				-e s/__VERSION__/$FIREFTP_VER/g \
				-e s/__MINVERSION__/$FIREFTP_MIN/g \
				-e s/__MAXVERSION__/$FIREFTP_MAX/g \
				install.rdf.in > install.rdf
	else
		sed -e s/__l10n__/$FIREFTP_LANG/g \
				-e s/__VERSION__/$FIREFTP_VER/g \
				-e s/__MINVERSION__/$FIREFTP_MIN/g \
				-e s/__MAXVERSION__/$FIREFTP_MAX/g \
				install.rdf.l10n > install.rdf
	fi
fi

sed -e s/__VERSION__/$FIREFTP_VER/g content/js/etc/globals.js.in > content/js/etc/globals.js

if [ $FIREFTP_MASTER -eq 1 ]
then
	zip -q -r9 chrome/fireftp.jar \
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
		-x "*/CVS/*" "*.in" "*.DS_Store" "*.swp" "*/.git/*" "*.gitignore"
else
	zip -q -r9 chrome/fireftp.jar \
		content \
		locale/$FIREFTP_LANG \
		skin \
		-x "*/CVS/*" "*.in" "*.DS_Store" "*.swp" "*/.git/*" "*.gitignore"
fi

if [ $FIREFTP_LANG = "en-US" ]
then
	rm ../downloads/fireftp.xpi
else
	rm ../downloads/fireftp_$FIREFTP_LANG.xpi	
fi

if [ $FIREFTP_LANG = "en-US" ]
then
  zip -q -9 ../downloads/fireftp.xpi \
    chrome/fireftp.jar \
    chrome/icons/default/fireftp-main-window.ico \
    chrome/icons/default/fireftp-main-window.xpm \
    components/nsIFireFTPUtils.xpt \
    components/nsIFireFTPUtils.js \
    components/sftpProtocol.js \
    components/ftpsProtocol.js \
    defaults/preferences/fireftp.js \
    chrome.manifest \
    install.rdf \
    license.txt
else
  zip -q -9 ../downloads/fireftp_$FIREFTP_LANG.xpi \
    chrome/fireftp.jar \
    chrome/icons/default/fireftp-main-window.ico \
    chrome/icons/default/fireftp-main-window.xpm \
    components/nsIFireFTPUtils.xpt \
    components/nsIFireFTPUtils.js \
    components/sftpProtocol.js \
    components/ftpsProtocol.js \
    defaults/preferences/fireftp.js \
    chrome.manifest \
    install.rdf \
    license.txt
fi

rm -rf chrome

if [ $FIREFTP_DEBUG -eq 1 ]
then
	osascript debug.scpt
	exit
fi

if [ $FIREFTP_LANG = "en-US" ]
then
	FIREFTP_MD5=`md5 -q ../downloads/fireftp.xpi`

	sed -e s#http:\/\/downloads.mozdev.org\/fireftp\/fireftp___l10n__.xpi#https:\/\/addons.mozilla.org\/firefox\/downloads\/latest\/684#g \
			-e s/__VERSION__/$FIREFTP_VER/g \
			-e s/__MINVERSION__/$FIREFTP_MIN/g \
			-e s/__MAXVERSION__/$FIREFTP_MAX/g \
			-e s/__MD5__/$FIREFTP_MD5/g \
			../www/update.rdf.in > ../www/update.rdf

	sed -e s/__VERSION__/$FIREFTP_VER/g \
			../www/index.html.in > ../www/index.html
else
	FIREFTP_MD5=`md5 -q ../downloads/fireftp_$FIREFTP_LANG.xpi`

	sed -e s/__l10n__/$FIREFTP_LANG/g \
			-e s/__VERSION__/$FIREFTP_VER/g \
			-e s/__MINVERSION__/$FIREFTP_MIN/g \
			-e s/__MAXVERSION__/$FIREFTP_MAX/g \
			-e s/__MD5__/$FIREFTP_MD5/g \
			../www/update.rdf.in > ../www/update_$FIREFTP_LANG.rdf

	# See https://bugzilla.mozilla.org/show_bug.cgi?id=396525#c8
	# See mccoy_cmdline_xuluwarrior.patch in http://www.mozdev.org/source/browse/fireftp/src/ written by Adrian Williams
	/Applications/McCoy.app/Contents/MacOS/mccoy -command update -updateRDF /Users/Mime/Sites/fireftp/fireftp/www/update_$FIREFTP_LANG.rdf -key fireftp
fi
