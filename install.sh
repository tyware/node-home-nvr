#!/bin/bash

sudo apt update
sudo apt upgrade -y
sudo apt install -y nodejs npm
sudo apt install -y git

git clone https://github.com/tyware/node-home-nvr.git ./node-home-nvr

cd node-home-nvr
npm install
chmod +x mediamtx/mediamtx
chmod +w mediamtx/mediamtx.yml
chmod +x start_motion_server.sh

tar -xvzf libext/linux/libopencv411.tar.gz -C libext/linux
chmod +x libext/linux/motion_server
sudo apt-get update
sudo apt-get install -y libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav

# Get current working directory	  
CURRENT_DIR=$(pwd)
# Replace the path in the service file
sed -i "s|/home-nvr-path|$CURRENT_DIR|g" services/home.service
sed -i "s|/home-nvr-path|$CURRENT_DIR|g" services/nvr.service
sed -i "s|/home-nvr-path|$CURRENT_DIR|g" services/motion-server.service

sudo cp -f services/home.service /etc/systemd/system/
sudo cp -f services/nvr.service /etc/systemd/system/
sudo cp -f services/motion-server.service /etc/systemd/system/

