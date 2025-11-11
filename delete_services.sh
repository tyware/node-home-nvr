#!/bin/bash

sudo systemctl stop home.service
sudo systemctl stop nvr.service
sudo systemctl stop motion-server.service

sudo systemctl disable home.service
sudo systemctl disable nvr.service
sudo systemctl disable motion-server.service

sudo rm /etc/systemd/system/home.service
sudo rm /etc/systemd/system/nvr.service
sudo rm /etc/systemd/system/motion-server.service

