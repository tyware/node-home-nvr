#!/bin/bash

export LD_LIBRARY_PATH=$(pwd)/libext/linux
$(pwd)/libext/linux/motion_server 7070

