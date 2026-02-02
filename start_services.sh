#!/bin/bash

sudo systemctl daemon-reload
sudo systemctl restart nvr-home.service
sudo systemctl restart nvr.service
sudo systemctl restart nvr-monitor.service
sudo systemctl restart motion-server.service
