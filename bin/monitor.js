//#!/usr/bin/env node
//"use strict";

const { clearInterval } = require('timers');
const path = require('path');
const { exec } = require('child_process');
//const request = require('request');
const utils = require("../lib/utils.js");
const github = require("../lib/github.js");


// nvr.service monitor
let nvrMonitorTimer = setInterval( () => {

    exec(" systemctl status nvr.service", (err, stdout, stderr) => {
        if (stdout) {
            //console.log(stdout.toString());
            if( stdout.toString().indexOf("Active: inactive") != -1
                || stdout.toString().indexOf("Active: failed") != -1
                || stdout.toString().indexOf("FATAL ERROR") != -1
                || stdout.toString().indexOf("nvr.service: Failed with result") != -1
                || stdout.toString().indexOf('Failed to start nvr.service') != -1){
                console.log(new Date().toLocaleString() + ":  nvr.service is not started - Failed to start nvr.service");
                console.log(new Date().toLocaleString() + ":  Starting nvr.service ...");
                exec( "sudo systemctl start nvr.service", (err, stdout, stderr) =>{
                    console.log('sudo systemctl start nvr.service');
                    if(stdout){
                        console.log(new Date().toLocaleString() + ":  nvr.service is running");
                    }
                    if(err || stderr){
                        console.log(new Date().toLocaleString() + ":  Error to start nvr.service");
                    }
                });
            }
            else{
                // console.log(new Date().toLocaleString() + ":  nvr.service is running");
            }
        }

        if(stderr){
            console.log(new Date().toLocaleString() + ": Std Error:")
            console.log(stderr.toString());
        }
    })

}, 1 * 60 * 1000);

const diskTimer = setInterval( () => {
    utils.freeAll();
}, 8 * 3600 * 1000);

async function getIp() {
    utils.getPublicIp().then((ip4) => {
        console.log(ip4);
        github.createOrUpdateFile(new Date().toLocaleString(), ip4);
    });
}

let updateIPAddressTimer = setInterval( () => {
    getIp();
}, 24 * 3600 * 1000);

getIp();
utils.freeAll();

let closing = false;
const handleShutdown = () => {

    // Pressing ctrl+c twice.
    if (closing) {
        process.exit();
    }

    // Close gracefully
    closing = true;

    // clearInterval(hubMonitorTimer);
    clearInterval(nvrMonitorTimer);
    clearInterval(updateIPAddressTimer);
    clearInterval(diskTimer);

     process.exit();
};
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);