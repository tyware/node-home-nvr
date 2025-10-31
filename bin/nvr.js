const { path: ffmpegPath } = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const { spawn, exec } = require('child_process');
const os = require('os');
const { clearInterval } = require('timers');
const fs = require("fs");
const utils = require("../lib/utils.js");
// const { rtsp_stream } = require("../lib/rtsp_stream.js");
const { MediaMTXService } = require('../lib/mediamtx_service.js');
const url = require('url');
const axios = require('axios');

const express = require('express');
const app = express();

let config = utils.getConfig();
let cameras = utils.cameras_nvr;
let download_path = path.join(cameras.download_path, "NAS");

// Motion detection service configuration
const MOTION_SERVICE_HOST =cameras.motion_server_host || '127.0.0.1';
const MOTION_SERVICE_PORT = cameras.motion_detection_port || 7070;
const MOTION_SERVICE_URL = process.env.MOTION_SERVICE_URL || `http://${MOTION_SERVICE_HOST}:${MOTION_SERVICE_PORT}`;

// API server only - no web views
app.use(express.json());

// Serve video files - configure to stream from download path
app.use('/videos', express.static(download_path));

let media_mtx_service = null;

// // Helper function to communicate with the motion detection service
// async function callMotionService(endpoint, method = 'GET', data = null) {
//     try {
//         const url = `${MOTION_SERVICE_URL}${endpoint}`;
//         const options = {
//             method,
//             url,
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         };
        
//         if (data && (method === 'POST' || method === 'PUT')) {
//             options.data = data;
//         }
        
//         const response = await axios(options);
//         return response.data;
//     } catch (error) {
//         console.error(`Error calling motion service at ${endpoint}: ${error.message}`);
//         throw error;
//     }
// }

// // Check if motion service is running
// async function checkMotionService() {
//     try {
//         const health = await callMotionService('/health');
//         console.log(`Motion detection service is ${health.status} with ${health.activeTasks} active tasks`);
//         return true;
//     } catch (error) {
//         console.error(`Motion detection service is not available: ${error.message}`);
//         console.error(`Make sure the motion service is running. Start it with: node bin/motion-server.js`);
//         return false;
//     }
// }

media_mtx_service = new MediaMTXService(cameras);
media_mtx_service.startService().then(() => {
    console.log("MediaMTX service started.");
    
    // // Check if motion service is available
    // checkMotionService().then(available => {
    //     if (available) {
    //         console.log("Motion detection service is available");
    //     } else {
    //         console.warn("Motion detection service is not available. Motion detection may not work properly.");
    //     }
    // });
}).catch((e) => {
    console.error("Failed to start MediaMTX service:", e);
});


// API routes only - no web routes

// Save camera configuration function
function saveCameraConfig() {
    try {
        // Save only to camera_nvr.json
        fs.writeFileSync(path.join(__dirname, '../camera_nvr.json'), JSON.stringify(cameras, null, 4));
        
        console.log('Camera configuration saved to camera_nvr.json');
        return true;
    } catch (error) {
        console.error('Error saving camera config to camera_nvr.json:', error);
        return false;
    }
}

// API to save global configuration
app.post('/api/config/global', (req, res) => {
    // Simon Confirmed
    try {
        const newConfig = req.body;
        
        // Update the global configuration properties
        cameras.nas_keep_days = newConfig.nas_keep_days;
        cameras.download_path = newConfig.download_path;
        cameras.keep_record_months = newConfig.keep_record_months;
        cameras.nvr_host = newConfig.nvr_host || '127.0.0.1';
        cameras.nvr_port = newConfig.nvr_port || 6060;
        cameras.local_footages = newConfig.local_footages;
        cameras.motion_detection_host = newConfig.motion_detection_host || '127.0.0.1';
        cameras.motion_detection_port = newConfig.motion_detection_port || 7070;
        cameras.motion_detection_max_workers = newConfig.motion_detection_max_workers || 0;
        cameras.motion_detection_resize_width = newConfig.motion_detection_resize_width || 320;
        cameras.motion_detection_resize_height = newConfig.motion_detection_resize_height || 180;
        cameras.web_port = newConfig.web_port || 8080;
        
        if (saveCameraConfig()) {
            res.json({ status: 'success', message: 'Global configuration saved successfully' });
        } else {
            res.json({ status: 'error', message: 'Failed to save configuration file' });
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to add a new camera
app.post('/api/camera', (req, res) => {
    // Simon Confirmed
    try {
        const newCamera = req.body;
        
        // Validate required fields
        if (!newCamera.name || !newCamera.url) {
            return res.json({ status: 'error', message: 'Name and URL are required' });
        }
        
        // Check if camera name already exists
        const existingCamera = cameras.cameras.find(cam => cam.name === newCamera.name);
        if (existingCamera) {
            return res.json({ status: 'error', message: 'Camera with this name already exists' });
        }
        
        if(media_mtx_service && media_mtx_service.addCameraWithValidation(newCamera.name, newCamera.source)) {
            cameras.cameras.push(newCamera);
            if (saveCameraConfig()) {
                res.json({ status: 'success', message: 'Camera added successfully' });
            } else {
                res.json({ status: 'error', message: 'Failed to save configuration file' });
            }
        } else {
            return res.json({ status: 'error', message: `Failed to add camera '${newCamera.name}' to MediaMTX` });
        }
        
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// // API to update existing camera or create new one (match by name or URL)
// app.post('/api/camera/update-or-create', (req, res) => {
//     try {
//         const newCamera = req.body;
        
//         // Validate required fields
//         if (!newCamera.name || !newCamera.url) {
//             return res.json({ status: 'error', message: 'Name and URL are required' });
//         }
        
//         // Get the update method - true means update by name, false means update by URL
//         const updateByName = newCamera.update_existing;
        
//         // Remove the update_existing flag from camera object before saving
//         delete newCamera.update_existing;
        
//         // Find existing camera based on the update method
//         let existingCameraIndex = -1;
//         if (updateByName) {
//             // Match by name only
//             existingCameraIndex = cameras.cameras.findIndex(cam => cam.name === newCamera.name);
//         } else {
//             // Match by URL only
//             existingCameraIndex = cameras.cameras.findIndex(cam => cam.url === newCamera.url);
//         }
        
//         if (existingCameraIndex >= 0) {
//             // Update existing camera
//             const oldCamera = cameras.cameras[existingCameraIndex];
//             const oldName = oldCamera.name;
            
//             // If name changed, update MediaMTX
//             if (media_mtx_service) {
//                 if (oldName !== newCamera.name) {
//                     // Delete old camera and add new one
//                     if (media_mtx_service.deleteCamera(oldName) && 
//                         media_mtx_service.addCameraWithValidation(newCamera.name, newCamera.source)) {
//                         cameras.cameras[existingCameraIndex] = newCamera;
//                     } else {
//                         return res.json({ status: 'error', message: `Failed to update camera '${oldName}' in MediaMTX` });
//                     }
//                 } else {
//                     // Same name, just update the camera
//                     cameras.cameras[existingCameraIndex] = newCamera;
//                 }
//             } else {
//                 cameras.cameras[existingCameraIndex] = newCamera;
//             }
            
//             if (saveCameraConfig()) {
//                 res.json({ status: 'success', message: `Camera '${newCamera.name}' updated successfully` });
//             } else {
//                 res.json({ status: 'error', message: 'Failed to save configuration file' });
//             }
//         } else {
//             // Create new camera
//             if(media_mtx_service && media_mtx_service.addCameraWithValidation(newCamera.name, newCamera.source)) {
//                 cameras.cameras.push(newCamera);
//                 if (saveCameraConfig()) {
//                     res.json({ status: 'success', message: `Camera '${newCamera.name}' added successfully` });
//                 } else {
//                     res.json({ status: 'error', message: 'Failed to save configuration file' });
//                 }
//             } else {
//                 return res.json({ status: 'error', message: `Failed to add camera '${newCamera.name}' to MediaMTX` });
//             }
//         }
        
//     } catch (error) {
//         res.json({ status: 'error', message: error.message });
//     }
// });

// API to update a camera by index
app.put('/api/camera/:index', (req, res) => {
    
    // Simon Confirmed

    try {
        const index = parseInt(req.params.index);
        const updatedCamera = req.body;
        
        if (index < 0 || index >= cameras.cameras.length) {
            return res.json({ status: 'error', message: 'Invalid camera index' });
        }
        
        // Validate required fields
        if (!updatedCamera.name || !updatedCamera.url) {
            return res.json({ status: 'error', message: 'Name and URL are required' });
        }
        
        // Check if camera name already exists (excluding current camera)
        const existingCamera = cameras.cameras.find((cam, idx) => cam.name === updatedCamera.name && idx !== index);
        if (existingCamera) {
            return res.json({ status: 'error', message: 'Camera with this name already exists' });
        }
        
        const oldCamera = cameras.cameras[index];
        const oldName = oldCamera.name;
        const nameChanged = oldName !== updatedCamera.name;
        const urlChanged = oldCamera.url !== updatedCamera.url;
        const audioChanged = oldCamera.audio !== updatedCamera.audio;
        const sourceChanged = oldCamera.source !== updatedCamera.source;
        const enableChanged = oldCamera.enable !== updatedCamera.enable;
        const device_snChanged = oldCamera.device_sn !== updatedCamera.device_sn;
        const notificationChanged = oldCamera.notification !== updatedCamera.notification;
        const motionDetectionChanged = oldCamera.motion_detection !== updatedCamera.motion_detection;
        
        // If MediaMTX is enabled and the camera name or URL has changed, update MediaMTX
        if (media_mtx_service && (nameChanged || urlChanged || audioChanged || sourceChanged || enableChanged || device_snChanged || notificationChanged || motionDetectionChanged)) {
            // Delete the old camera configuration
            const deleteSuccess = media_mtx_service.deleteCamera(oldName);
            
            if (!deleteSuccess) {
                return res.json({ status: 'error', message: `Failed to update MediaMTX configuration: Could not delete camera '${oldName}'` });
            }
            
            // Add the updated camera configuration
            if(updatedCamera.enable) {
                const addSuccess = media_mtx_service.addCameraWithValidation(updatedCamera.name, updatedCamera.source);
                
                if (!addSuccess) {
                    return res.json({ status: 'error', message: `Failed to update MediaMTX configuration: Could not add camera '${updatedCamera.name}'` });
                }
            }
        }
        
        // Update the camera in the local configuration
        cameras.cameras[index] = updatedCamera;
        
        if (saveCameraConfig()) {
            res.json({ status: 'success', message: `Camera '${updatedCamera.name}' updated successfully` });
        } else {
            res.json({ status: 'error', message: 'Failed to save configuration file' });
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to delete a camera
app.delete('/api/camera/:index', (req, res) => {

    // Simon Confirmed

    try {
        const index = parseInt(req.params.index);
        
        if (index < 0 || index >= cameras.cameras.length) {
            return res.json({ status: 'error', message: 'Invalid camera index' });
        }
        
        const camera_name = cameras.cameras[index].name;
        // remove the rtsp relay from mediaMTX
        if(media_mtx_service && media_mtx_service.deleteCamera(camera_name)) {
            cameras.cameras.splice(index, 1);
            if (saveCameraConfig()) {
                res.json({ status: 'success', message: `Camera '${camera_name}' deleted successfully` });
            } else {
                res.json({ status: 'error', message: `Failed to save configuration file` });
            }
        }
        else {
            return res.json({ status: 'error', message: `Failed to delete camera '${camera_name}' from MediaMTX` });
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// // API to delete camera from MediaMTX
// app.get('/delCamera/:name', (req, res) => {
//     const cameraName = req.params.name;
//     if(media_mtx_service && media_mtx_service.deleteCamera(cameraName)) {
//         const info = `[nvr.js] Camera ${cameraName} deleted from MediaMTX`;
//         utils.log("nvr_rtsp", info); 
//         console.log(info);
//         res.json({
//             status: 'ok',
//             name: cameraName,
//             url: "",
//             message: "deleted"
//         });
//      }
//     else {
//         utils.log("nvr_rtsp", `[nvr.js] Failed to delete camera ${cameraName} from MediaMTX`);
//         console.error(`[nvr.js] Failed to delete camera ${cameraName} from MediaMTX`);
//         res.json({
//             status: 'failed',
//             name: cameraName,
//             url: "",
//             message: `Failed to delete camera ${cameraName} from MediaMTX`
//         });
//     }
// });

// // API to add camera to MediaMTX
// app.get('/addCamera/:name/:url', (req, res) => {
//     const cameraName = req.params.name;
//     const cameraUrl = req.params.url;
//     try {
//         if(media_mtx_service && media_mtx_service.addCameraWithValidation(cameraName, cameraUrl)) {
//             const info = `[nvr.js] Camera ${cameraName} added to MediaMTX with URL ${cameraUrl}`;
//             utils.log("nvr_rtsp", info); 
//             console.log(info);
//             res.json({
//                 status: 'ok',
//                 name: cameraName,
//                 url: cameraUrl,
//                 message: "added"
//             });
//          }
//         else {
//             utils.log("nvr_rtsp", `[nvr.js] Failed to add camera ${cameraName} to MediaMTX`);
//             console.error(`[nvr.js] Failed to add camera ${cameraName} to MediaMTX`);
//             res.json({
//                 status: 'failed',
//                 name: cameraName,
//                 url: cameraUrl,
//                 message: `Failed to add camera ${cameraName} to MediaMTX`
//             });
//         }
//     } catch (e) {
//         res.json({
//             status: 'failed',
//             name: cameraName,
//             url: cameraUrl,
//             message: `Error: ${e.message}`
//         });
//     }
// });
// app.get('/listCameras', (req, res) => {
//     if(media_mtx_service) {
//         res.json({
//             status: 'ok',
//             cameras: media_mtx_service.configPaths || []
//         });
//      } else {
//         res.json({
//             status: 'error',
//             message: 'MediaMTX service not available'
//         });
//     }
// });


// === Security API endpoints for footage access ===

// API to get footage dates for a specific camera
app.get('/api/security/footage-dates/:cameraName', (req, res) => {
    // Simon Confirmed
    const cameraName = req.params.cameraName;
    const cameraPath = path.join(download_path, cameraName);
    
    try {
        // Check if the camera directory exists
        if (!fs.existsSync(cameraPath)) {
            return res.json({ status: 'error', message: 'No footage found for this camera' });
        }
        
        // Get all date directories
        const dates = fs.readdirSync(cameraPath)
            .filter(item => fs.statSync(path.join(cameraPath, item)).isDirectory())
            .filter(item => /^\d{4}\d{2}\d{2}$/.test(item)) // Filter for date format directories
            .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
        
        res.json({ status: 'success', dates });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to get footage by hour for a specific camera and date
app.get('/api/security/footage-hours/:cameraName/:date', (req, res) => {
    // Simon Confirmed
    const { cameraName, date } = req.params;
    const dateFolder = path.join(download_path, cameraName, date);
    
    try {
        // Check if the date directory exists
        if (!fs.existsSync(dateFolder)) {
            return res.json({ status: 'error', message: 'No footage found for this date' });
        }
        
        // Get all MP4 files and organize by hour
        const files = fs.readdirSync(dateFolder)
            .filter(file => file.endsWith('.mp4'));
        
        // Group files by hour (assuming filename format has hour information)
        const hours = {};
        files.forEach(file => {
            // Extract time from filename (assuming format like "YYYYMMDD-HHMMSS-120.mp4")
            const match = file.match(/(\d{8})-(\d{2})(\d{2})(\d{2})-\d+\.mp4$/);
            if (match) {
                const hour = match[2]; // The second group is the hour
                if (!hours[hour]) {
                    hours[hour] = [];
                }
                hours[hour].push(file);
            }
        });
        
        // Convert to sorted array format
        const hoursSorted = Object.keys(hours).sort().map(hour => ({
            hour,
            files: hours[hour].sort()
        }));
        
        res.json({ status: 'success', hours: hoursSorted });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to search for footage by specific date
app.get('/api/security/search-footage/:cameraName/:date', (req, res) => {
    // Simon Confirmed
    const { cameraName, date } = req.params;
    const devicePath = path.join(download_path, cameraName);
    const specificDateFolder = path.join(devicePath, date);
    
    try {
        // First check if the camera directory exists
        if (!fs.existsSync(devicePath)) {
            return res.json({ status: 'error', message: 'No footage found for this camera' });
        }
        
        // Check if the specific date folder exists
        if (fs.existsSync(specificDateFolder)) {
            // If the folder exists, check if it contains any MP4 files
            const files = fs.readdirSync(specificDateFolder)
                .filter(file => file.endsWith('.mp4'));
                
            if (files.length > 0) {
                // Return success with a flag indicating footage was found
                return res.json({ status: 'success', found: true });
            }
        }
        
        // If we get here, either the folder doesn't exist or it has no MP4 files
        return res.json({ status: 'error', message: 'No footage found for this date' });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to get video file info
app.get('/api/security/video-info/:cameraName/:date/:filename', (req, res) => {
    // Simon Confirmed
    const { cameraName, date, filename } = req.params;
    const videoPath = path.join(download_path, cameraName, date, filename);
    
    try {
        // Check if file exists
        if (!fs.existsSync(videoPath)) {
            return res.json({ status: 'error', message: 'Video file not found' });
        }
        
        // Get file stats
        const stats = fs.statSync(videoPath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        
        // Extract timestamp from filename
        const match = filename.match(/(\d{8})-(\d{2})(\d{2})(\d{2})-\d+\.mp4$/);
        let timestamp = null;
        if (match) {
            const [_, datePart, hours, minutes, seconds] = match;
            timestamp = `${hours}:${minutes}:${seconds}`;
        }
        
        res.json({
            status: 'success',
            info: {
                filename,
                path: `/videos/${cameraName}/${date}/${filename}`,
                size: fileSizeInMB.toFixed(2) + ' MB',
                date,
                timestamp
            }
        });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to get camera list and config
app.get('/getCameraList', (req, res) => {
    res.json({
        config: {
            rtsp_relay_port: cameras.rtsp_relay_port,
            nas_rtsp_relay_port: cameras.nas_rtsp_relay_port
        },
        cameras: cameras.cameras
    });
});
// API to get video list by date
app.get('/getVideoList', (req,res) => {
    let parms = url.parse(req.url, true).query;
    try {
        let videoList = utils.getVideoListByDate(config, parms.device, parms.date);
        res.json(videoList);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to restart
app.get('/restart/node-nvr', (req, res) => {
    if(os.platform() === 'win32') {
        res.json({ status: 'error', message: "restart command is not supported on Windows." });
        return;
    }
    res.json({ status: 'success', message: "restarting..." });
    
    console.log("NVR restarting...");
    utils.log("nvr_rtsp", "NVR restarting...");
    media_mtx_service && media_mtx_service.stopService();
    exec( "sudo systemctl restart node-nvr.service", (err, stdout, stderr) =>{
        console.log('sudo systemctl restart node-nvr.service');
        if(stdout){
            console.log(new Date().toLocaleString() + ":  node-nvr.service is running");
        }
        if(err || stderr){
            console.log(new Date().toLocaleString() + ":  Error to start node-nvr.service");
        }
    });
});

// // Motion detection API endpoint
// app.post('/api/motion/detect', async (req, res) => {
//     try {
//         const { cameraName, filePath, dateStr } = req.body;
        
//         if (!cameraName || !filePath || !dateStr) {
//             return res.json({ 
//                 status: 'error', 
//                 message: 'Missing required parameters: cameraName, filePath, or dateStr'
//             });
//         }
        
//         // Check if camera has motion detection enabled
//         const camera = cameras.cameras[cameraName];
//         if (!camera) {
//             return res.json({ 
//                 status: 'error', 
//                 message: `Camera '${cameraName}' not found` 
//             });
//         }
        
//         if (!camera.motion_detection) {
//             return res.json({ 
//                 status: 'success', 
//                 message: `Motion detection is disabled for camera '${cameraName}'`,
//                 detected: false
//             });
//         }
        
//         // Forward the request to the motion detection service
//         try {
//             console.log(`Forwarding motion detection request to service for ${cameraName}: ${filePath}`);
//             const result = await callMotionService('/detect', 'POST', {
//                 cameraName,
//                 videoPath: filePath,
//                 dateStr
//             });
            
//             // Return the response from the motion detection service
//             res.json({
//                 status: 'success',
//                 message: `Motion detection task started for camera '${cameraName}'`,
//                 taskId: result.taskId,
//                 detected: true
//             });
//         } catch (serviceError) {
//             console.error(`Error from motion detection service: ${serviceError.message}`);
//             res.json({ 
//                 status: 'error', 
//                 message: `Motion detection service error: ${serviceError.message}` 
//             });
//         }
//     } catch (error) {
//         console.error(`Motion detection API error: ${error.message}`);
//         res.json({ status: 'error', message: error.message });
//     }
// });

/*// API endpoint to get motion detection events
app.get('/api/motion/events/:cameraName/:date', async (req, res) => {
    try {
        const { cameraName, date } = req.params;
        
        if (!cameraName || !date) {
            return res.json({
                status: 'error',
                message: 'Missing required parameters: cameraName or date'
            });
        }
        
        // Forward the request to the motion detection service
        try {
            const result = await callMotionService(`/events/${cameraName}/${date}`);
            res.json(result);
        } catch (serviceError) {
            console.error(`Error getting motion events from service: ${serviceError.message}`);
            res.json({
                status: 'error',
                message: `Motion detection service error: ${serviceError.message}`
            });
        }
    } catch (error) {
        console.error(`Motion events API error: ${error.message}`);
        res.json({ status: 'error', message: error.message });
    }
});*/

// // API endpoint to check motion detection service health
// app.get('/api/motion/health', async (req, res) => {
//     try {
//         const health = await callMotionService('/health');
//         res.json(health);
//     } catch (error) {
//         res.json({
//             status: 'error',
//             message: `Motion detection service is not available: ${error.message}`
//         });
//     }
// });

// // API endpoint to get active motion detection tasks
// app.get('/api/motion/tasks', async (req, res) => {
//     try {
//         const tasks = await callMotionService('/tasks');
//         res.json(tasks);
//     } catch (error) {
//         res.json({
//             status: 'error',
//             message: `Motion detection service is not available: ${error.message}`
//         });
//     }
// });

// listen to NVR RTSP port
const RTSP_PORT = cameras.nvr_port || 6060;
app.listen(RTSP_PORT, () => {
    console.log(`NVR RTSP REST API server at port ${RTSP_PORT} is running...`);
    utils.log("nvr_rtsp", `NVR RTSP REST API server at port ${RTSP_PORT} is running...`);
});


// // set timer to free disk for next day
const diskTimer = setInterval( utils.freeAll, 8 * 3600 * 1000);

let closing = false;
const handleShutdown = () => {

    media_mtx_service && media_mtx_service.stopService();

    // Pressing ctrl+c twice.
    if (closing) {
        process.exit();
    }

    // Close gracefully
    closing = true;

    clearInterval(diskTimer);

    process.exit();
};
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// Motion detection is triggered directly by rtsp_stream.js when video files are moved
// This happens in the moveCurrentFile method, which calls triggerMotionDetection
