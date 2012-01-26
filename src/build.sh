#!/bin/bash

FIREFTP_VER=2.0.1
FIREFTP_MIN=4.0b1
FIREFTP_MAX=10.*
FIREFTP_MASTER=0
FIREFTP_DEBUG=0

# build English-only
FIREFTP_LANG=en-US
source build_helper.sh

# build all locales
FIREFTP_LANG=all
FIREFTP_MASTER=1
source build_helper.sh

# alternatively, do proxies:
# https://developer.mozilla.org/en/Setting_up_extension_development_environment#Firefox_extension_proxy_file
