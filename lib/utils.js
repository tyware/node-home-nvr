
const { networkInterfaces } = require('os');
const fs = require("fs");
const { url } = require('inspector');
const path = require('path');

// const disk = require('diskusage');

// // get disk usage. Takes mount point as first parameter
// disk.check('/workspaces', function(err, info) {
//     console.log(info.free);
//     console.log(info.total);
// });


let config_node = null;

exports.setConfig = (new_config) => {
    config_node = new_config;
}
exports.getConfig = () => {
    if(config_node)
        return config_node;
    else {
        config_node = this.loadJsonFile("./config.json") || 
            {
                ws_server: "127.0.0.1",
                ws_port: 3000,
                ws_push_notification_port: "3001",
                viewer_port: "3030",
                get_video_hours: 12,
                download_timer_minutes: 3,
                heartbeat_timer_seconds: 12,
                schemaVersion: 14,
                download_path: "./",
                keep_record_months: 3,
                log_obj_to_console: true,
                log_to_console: true,
                log_file: "./log.txt",
                nas_keep_days: 15,
                nas_heartbeat: 15,
                nas_enable: false,
                nas_rtsp_relay_port: 3032
            };

        if (config_node.download_path[config_node.download_path.length - 1] != "/")
        config_node.download_path += "/";
    }
    
    return config_node;
}

let onOffDevices = null;

exports.getOnOffDevices = (reload) => {
    if(!reload && onOffDevices) return onOffDevices;
    else {
        onOffDevices = this.loadJsonFile("./devices.json") || { data:[] };
        return onOffDevices;
    }
}

exports.getIpAddress = () => {

    const nets = networkInterfaces();
    const results = Object.create(null); // Or just '{}', an empty object

    let ip = "";
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal && (name == "eth0" || name == "Wi-Fi")) {
                ip = net.address;
                break;
            }
        }
        if (ip != "")
            break;
    }
    if (ip == "") ip = "127.0.0.1";

    return ip;
}

exports.loadJsonFile = (file) => {

    if (!fs.existsSync(file))
        //throw file + " is not available!";
        return undefined;

    const contents = fs.readFileSync(file, "utf8").toString();
    let res = JSON.parse(contents);
    return res;
}

exports.cameras = this.loadJsonFile("camera.json") || {
    "nvr_host": "127.0.0.1",
    "nvr_port": 6060,
    "nas_keep_days": 50,
    "download_path": "C:/Simon/CamHub/src/node-home-nvr/data/",
    "keep_record_months": 3,
    "local_footages": true,
    "cameras": []    
};

exports.cameras_nvr = this.loadJsonFile("camera_nvr.json") || {
    "nvr_host": "127.0.0.1",
    "nvr_port": 6060,
    "nas_keep_days": 50,
    "download_path": "C:/Simon/CamHub/src/node-home-nvr/data/",
    "keep_record_months": 3,
    "local_footages": true,
    "cameras": []    
};

exports.getDeviceSN = (device_name) => {

    for (let i = 0; i < this.cameras.cameras.length; i++) {

        if (this.cameras.cameras[i].name == device_name)
            return this.cameras.cameras[i].device_sn;
    }

    return "";
}

exports.getDeviceData = (device_name) => {

    for (let i = 0; i < this.cameras.cameras.length; i++) {

        if (this.cameras.cameras[i].name == device_name)
            return this.cameras.cameras[i];
    }

    return null;
}

exports.getDeviceName = (device_sn) => {

    for (let i = 0; i < this.cameras.cameras.length; i++) {

        if (this.cameras.cameras[i].device_sn == device_sn)
            return this.cameras.cameras[i].name;
    }

    return "";
}

exports.canNotification = (device_sn) => {

    for (let i = 0; i < this.cameras.cameras.length; i++) {

        if (this.cameras.cameras[i].device_sn == device_sn){
            //console.log("Notification: " + device_sn + " = " + this.cameras.cameras[i].notify);
            return this.cameras.cameras[i].notify;
        }
    }

    return false;
 
}

// jquery Deferred-like promise
exports.promiseCreator = () => {
    let res, rej, prom = new Promise((inner_res, inner_rej) => {
        res = inner_res;
        rej = inner_rej;
    });
    prom.resolve = res;
    prom.reject = rej;
    return prom;
}

exports.escapeAnd = (url) => {

    let res = "";

    for(let i = 0; i<url.length; i++){

        if(url[i] == '&'){
            res += "%26";
        }
        else
            res += url[i];
    }

    return res;

}

exports.decodeURLString = (url) => {

    let res = "";

    for(let i = 0; i<url.length; i++){

        if(url[i] == '%'){

            if(url[i+1] == '2'){
                if(url[i+2] == "0"){
                    res += ' ';
                    i += 2;
                }
                else if(url[i+2] == '1'){
                    res += '!';
                    i += 2;
                }
                else if(url[i+2] == '2'){
                    res += '"';
                    i += 2;
                }
                else if(url[i+2] == '3'){
                    res += '#';
                    i += 2;
                }
                else if(url[i+2] == '4'){
                    res += '$';
                    i += 2;
                }
                else if(url[i+2] == '5'){
                    res += '%';
                    i += 2;
                }
                else if(url[i+2] == '6'){
                    res += '&';
                    i += 2;
                }
                else if(url[i+2] == '7'){
                    res += "'";
                    i += 2;
                }
                else if(url[i+2] == '8'){
                    res += '(';
                    i += 2;
                }
                else if(url[i+2] == '9'){
                    res += ')';
                    i += 2;
                }
                else {
                    res += url[i];
                }
            }
            else if(url[i+1] == '3'){
                if(url[i+2] == 'A'){
                    res += ':';
                    i += 2;
                }
                else if(url[i+2] == 'B'){
                    res += ';';
                    i += 2;
                }
                else if(url[i+2] == 'C'){
                    res += '<';
                    i += 2;
                }
                else if(url[i+2] == 'D'){
                    res += '=';
                    i += 2;
                }
                else if(url[i+2] == 'E'){
                    res += '>';
                    i += 2;
                }
                else if(url[i+2] == 'F'){
                    res += '?';
                    i += 2;
                }
                else{
                    res += url[i];
                }
            }
            else if(url[i+1] == '4'){
                if(url[i+1] == '0'){
                    res += '@';
                    i += 2;
                }
                else
                    res += url[i];
            }
            else if(url[i+1] == '5'){
                if(url[i+2] == 'B'){
                    res += '[';
                    i += 2;
                }
                else if(url[i+2] == 'C'){
                    res += '\\';
                    i += 2;
                }
                else if(url[i+2] == 'D'){
                    res += ']';
                    i += 2;
                }
                else if(url[i+2] == 'E'){
                    res += '^';
                    i += 2;
                }
                else{
                    res += url[i];
                }
            }
            else if(url[i+1] == '6'){
                if(url[i+2] == '0'){
                    res += '`';
                    i += 2;
                }
                else{
                    res += url[i];
                }
            }
            else if(url[i+1] == '7'){
                if(url[i+2] == 'B'){
                    res += '{';
                    i += 2;
                }
                else if(url[i+2] == 'D'){
                    res += '}';
                    i += 2;
                }
                else if(url[i+2] == 'E'){
                    res += '~';
                    i += 2;
                }
                else{
                    res += url[i];
                }
            }
            else
                res += url[i];
        }
        else if (url[i] == '&') {
            res += "%26";
        }
        else {
            res += url[i];
        }

    }

    return res;
}

exports.getDiskUsage = () => {
    let promise = new Promise((resolve) => {
        if(process.platform !== 'win32') {
            const disk = require('check-disk-space').default;
            disk('/home/pi/home/cam').then((data) =>{
                let free_gb = Math.floor((data.free / (1024*1024*1024)));
                let free_mb = Math.floor(((data.free % (1024*1024*1024)) / (1024*1024)));
                let size_gb = Math.floor((data.size / (1024*1024*1024)));
                let size_mb = Math.floor(((data.size % (1024*1024*1024)) / (1024*1024)));
                // let free_gb = Math.floor((data.free / (1000*1000*1000)));
                // let free_mb = Math.floor(((data.free % (1000*1000*1000)) / (1000*1000)));
                // let size_gb = Math.floor((data.size / (1000*1000*1000)));
                // let size_mb = Math.floor(((data.size % (1000*1000*1000)) / (1000*1000)));
                let res = "free: " + free_gb.toString() + "G, " + free_mb.toString() + "M\n";
                res += "total: " + size_gb.toString() + "G, " + size_mb.toString() + "M\n";
                resolve(res);
            });
        }
        else
            resolve("");
    });

    return promise;
}

exports.getTimeString = (time, delimiter) => {
    let date1 = time? (new Date(time)) : (new Date());
    let year = date1.getFullYear();
    let month = date1.getMonth() + 1;
    let day = date1.getDate();
    let hours = date1.getHours();
    let minutes = date1.getMinutes();
    let seconds = date1.getSeconds();
    if(month < 10) month = "0" + month;
    if(day < 10) day = "0" + day;
    if(hours < 10) hours = "0" + hours;
    if(minutes < 10) minutes = "0" + minutes;
    if(seconds < 10) seconds = "0" + seconds;

    if(!delimiter) delimiter = "";

    return {
        date: "" + year + delimiter + month + delimiter + day,
        time: "" + hours + delimiter + minutes + delimiter + seconds
    };
}

exports.freeNasDownloads = () => {

    let cfg = this.getConfig();
    let t_date = (new Date()).getTime() - this.cameras.nas_keep_days * 86400 * 1000;
    let date1 = new Date(t_date);
    let datestr = this.getTimeString(date1);
    let cmpDateStr = datestr.date;

    console.log("Delete NAS files before " + cmpDateStr + " ... ");
    this.log("freeNasDownload", "Delete files before " + cmpDateStr + " ... ");

    let download_path = this.cameras.download_path + "NAS/";
    if (fs.existsSync(download_path)) {

        let deviceDirs = fs.readdirSync(download_path);
        for (let j = 0; j < deviceDirs.length; j++) {
            // console.log("freeNasDownload: " + deviceDirs[j]);
            const devicePath = download_path + deviceDirs[j];

            if (!fs.lstatSync(devicePath).isDirectory())
                continue;

            this.log("freeNasDownload", "...[" + deviceDirs[j] + "]");
            let files = fs.readdirSync(devicePath);
            for (let i = 0; i < files.length; i++) {

                if (files[i].localeCompare(cmpDateStr) < 0) {

                    this.log("freeNasDownload", ".......... Delete file: " + files[i]);
                    fs.rm(path.join(devicePath, files[i]), { recursive: true, force: true }, (err) => {
                    });
                }
            };
        }
    }
}

exports.freeLogs = () => {

    let t_date = (new Date()).getTime() - this.cameras.nas_keep_days * 86400 * 1000;
    let date1 = new Date(t_date);
    let datestr = this.getTimeString(date1, "-");
    let cmpDateStr = datestr.date + ".log";

    console.log("Delete log files before " + cmpDateStr + " ... ");
    this.log("freeLogs", "Delete files before " + cmpDateStr + " ... ");

    let download_path = this.cameras.download_path + "logs/";
    if (fs.existsSync(download_path)) {

        let deviceDirs = fs.readdirSync(download_path);
        for (let j = 0; j < deviceDirs.length; j++) {
            // console.log("freeLogs: " + deviceDirs[j]);
            const devicePath = download_path + deviceDirs[j];
            if (!fs.lstatSync(devicePath).isDirectory())
                continue;
            let files = fs.readdirSync(devicePath);
            for (let i = 0; i < files.length; i++) {

                if (files[i].localeCompare(cmpDateStr) < 0) {

                    this.log("freeLogs", ".......... Delete file: " + files[i]);
                    fs.rm(path.join(devicePath, files[i]), { force: true }, (err) => {
                    });
                }
            };
        }
    }
}

exports.freePushNotifyInfo = () => {

    let t_date = (new Date()).getTime() - this.cameras.nas_keep_days * 86400 * 1000;
    let date1 = new Date(t_date);
    let datestr = this.getTimeString(date1);
    let cmpDateStr = datestr.date + ".json";

    console.log("Delete log files before " + cmpDateStr + " ... ");
    this.log("freePushNotifyInfo", "Delete files before " + cmpDateStr + " ... ");

    let download_path = this.cameras.download_path + "NASMotion/";
    if (fs.existsSync(download_path)) {

        let deviceDirs = fs.readdirSync(download_path);
        for (let j = 0; j < deviceDirs.length; j++) {
            // console.log("freePushNotifyInfo: " + deviceDirs[j]);
            const devicePath = download_path + deviceDirs[j];
            if (!fs.lstatSync(devicePath).isDirectory())
                continue;
            let files = fs.readdirSync(devicePath);
            for (let i = 0; i < files.length; i++) {

                if (files[i].localeCompare(cmpDateStr) < 0) {

                    this.log("freePushNotifyInfo", ".......... Delete file: [" + + deviceDirs[j] + "] " + files[i]);
                    fs.rm(path.join(devicePath, files[i]), { force: true }, (err) => {
                    });
                }
            };
        }
    }
}

exports.freeEufyDownloads = () => {

    let config = this.getConfig();
    let date1 = new Date();
    let year = date1.getFullYear();
    let month = date1.getMonth() + 1;
    let day = date1.getDate();

    let baseYear = year;
    let baseMonth = month - (this.cameras.keep_record_months?this.cameras.keep_record_months:3);

    if (baseMonth <= 0) {
        baseYear--;
        baseMonth += 12;
    }

    let baseYearStr = baseYear.toString();
    let baseMonthStr = (baseMonth > 9) ? baseMonth.toString() : "0" + baseMonth.toString();
    let baseDayStr = (day > 9) ? day.toString() : "0" + day.toString();

    let cmpDateStr = baseYearStr + baseMonthStr + baseDayStr;

    console.log("Delete Eufy files before " + cmpDateStr + " ... ");
    this.log("freeEufyDownloads", "Delete files before " + cmpDateStr + " ... ");

    let download_path = this.cameras.download_path + 'Eufy/'
    if (fs.existsSync(download_path)) {

        let deviceDirs = fs.readdirSync(download_path);
        for (let j = 0; j < deviceDirs.length; j++) {
            const devicePath = download_path + deviceDirs[j];
            if (!fs.lstatSync(devicePath).isDirectory())
                continue;
            let dirs = fs.readdirSync(devicePath);
            for (let i = 0; i < dirs.length; i++) {
                // console.log("eufyDownload: " + dirs[i]);
                const datePath = devicePath + "/" + dirs[i];
                if (fs.lstatSync(datePath).isDirectory()) {

                    if (dirs[i].localeCompare(cmpDateStr) < 0) {

                        fs.rm(datePath, { recursive: true, force: true }, (err) => {
                            if (err)
                                this.log("freeEufyDownload", `Failed to delete ${datePath} !`);
                            else
                                this.log("freeEufyDownload", `${datePath} is deleted!`);
                        });
                    }
                }
            };
        }
    }
    else {
        this.log("freeEufyDownload", "The folder '" + download_path + "' doesnot exist!");
    }
    
}

exports.freeAll = () => {
    this.getDiskUsage().then((data) => {
        console.log(data);
        utils.log("freeNasDownload", "Disk info before deletion: " + data);
    });
    // free NAS download
    this.freeNasDownloads();
    // free Eufy download
    this.freeEufyDownloads();
    // free logs
    this.freeLogs();
    // free push notification logs
    this.freePushNotifyInfo();
    this.getDiskUsage().then((data) => {
        console.log(data);
        utils.log("freeNasDownload", "Disk info after deletion: " + data);
    });

}

exports.log = (log_name, msg) => {
    let datestr = this.getTimeString((new Date()).getTime(), "-");
    let dir = this.cameras.download_path + "logs/" + log_name;
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });

    let file_name = dir + "/" + datestr.date + ".log";
    let data = datestr.date + " " + datestr.time + "  " + msg + "\n";
    fs.appendFile(file_name, data, { flag: "a" }, (err)=>{});
}


exports.writePushInfo = (device) => {
    let datestr = this.getTimeString();
    let dir = this.this.cameras.download_path + "NASMotion/" + device;
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    
    let filepath = dir + "/" + datestr.date + ".json";
    let data = {
        device: device,
        time: datestr.time
    };
    if(fs.existsSync(filepath)) {
        fs.appendFile(filepath, "," + JSON.stringify(data), { flag: "a" }, function (err) {});
    }
    else {
        fs.appendFile(filepath, JSON.stringify(data), { flag: "a" }, function (err) {});
    }
}

exports.getPublicIp = async () => {
    const { publicIpv4 } = await import('public-ip');

    return publicIpv4(); // it is Promise
}
