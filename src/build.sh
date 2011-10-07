#!/bin/bash

FIREFTP_VER=1.99.6
FIREFTP_MIN=4.0b1
FIREFTP_MAX=8.*
FIREFTP_MASTER=0
FIREFTP_DEBUG=0

# build English-only
FIREFTP_LANG=en-US
source build_helper.sh

# build all locales
FIREFTP_LANG=all
FIREFTP_MASTER=1
source build_helper.sh
