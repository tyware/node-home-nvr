#!/bin/bash

sudo systemctl daemon-reload
sudo systemctl restart home.service
sudo systemctl restart nvr.service
sudo systemctl restart motion-server.service
