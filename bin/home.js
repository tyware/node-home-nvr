const express = require('express');
const path = require('path');
const fs = require("fs");
const utils = require("../lib/utils.js");
const { MediaMTXService } = require('../lib/mediamtx_service.js');
const url = require('url');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
const ews = require('express-ws')(app);

let config = utils.getConfig();
let cameras = utils.cameras;
let download_path = path.join(cameras.download_path, "NAS");

// NVR API server configuration - using function to always get the current value
function getNvrApiServer() {
    return `http://${cameras.nvr_host}:${cameras.nvr_port}`;
}

// Helper function to forward requests to API server
async function forwardToApi(method, hostStr, endpoint, data = null) {
    try {
        const url = `${hostStr}${endpoint}`;
        const options = {
            method,
            url,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data && (method === 'post' || method === 'put')) {
            options.data = data;
        }
        
        const response = await axios(options);
        return response.data;
    } catch (error) {
        console.error(`Error forwarding request to server: ${error.message}`);
        if (error.response) {
            return error.response.data;
        }
        return { status: 'error', message: `Failed to connect to server: ${error.message}` };
    }
}


async function forwardToNvrApi(method, endpoint, data = null) {
    return forwardToApi(method, getNvrApiServer(), endpoint, data);
}

// Setup middleware
app.engine('.ejs', require('ejs').__express);
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit for thumbnails
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.set('views', path.join(__dirname, '../views'));

// Use cookie-parser and session
app.use(cookieParser());
app.use(cors());
app.use(session({
    secret: 'home-security-server',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
    rolling: true // refresh expiration on activity
}));

// Simple authentication middleware if needed
const authenticate = (req, res, next) => {
    // Check if the user is authenticated
    if (req.session && req.session.isAuthenticated) {
        next(); // Allow access to the next middleware or route
    } else {
        res.redirect('/login');
    }
};

// Optional login route - enable if you want authentication
/*
app.get('/login', (req, res) => {
    res.render('login', { title: "Login" });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const config = utils.getConfig();

    if (username === config.user && password === config.password) {
        req.session.isAuthenticated = true;
        res.redirect(req.session?.originalUrl || '/');
    } else {
        res.render('login', { title: "Login", error: "Invalid credentials" });
    }
});
*/

// Web routes moved from nvr.js

// Home/Camera configuration page
app.get(['/', '/camera_config'], (req, res) => {
    // Create a clean copy of the cameras config without circular references
    const cleanConfig = {
        nas_keep_days: cameras.nas_keep_days,
        download_path: cameras.download_path,
        keep_record_months: cameras.keep_record_months,
        nvr_host: cameras.nvr_host,
        nvr_port: cameras.nvr_port,
        local_footages: cameras.local_footages,
        motion_detection_host: cameras.motion_detection_host || '127.0.0.1',
        motion_detection_port: cameras.motion_detection_port || 7070,
        motion_detection_max_workers: cameras.motion_detection_max_workers || 0,
        motion_detection_resize_width: cameras.motion_detection_resize_width || 320,
        motion_detection_resize_height: cameras.motion_detection_resize_height || 180,
        cameras: cameras.cameras.map(camera => ({
            name: camera.name,
            device_sn: camera.device_sn,
            url: camera.url,
            source: camera.source || 'N/A',
            audio: camera.audio,
            enable: camera.enable,
            download_clips: camera.download_clips || false,
            notification: camera.notification || false,
            motion_detection: camera.motion_detection || false
        }))
    };
    
    res.render('camera_config', {
        title: "Camera Configuration",
        config: cleanConfig
    });
});

// Test page
app.get('/test', (req, res) => {
    res.render('test', {
        title: "Test Page",
        msg: 'test'
    });
});

// Test upload page
app.get('/upload', (req, res) => {
    res.render('upload', {
        title: "Test Upload File Page",
        msg: 'test upload file'
    });
});

// Security page - new functionality
app.get('/security', (req, res) => {
    // Get all cameras for display
    const cameraList = cameras.cameras.filter(camera => camera.enable).map(camera => {
        const cameraPath = path.join(download_path, camera.name);
        // Check if camera has footage by checking if directory exists and has content
        const hasFootage = fs.existsSync(cameraPath) && 
                          fs.readdirSync(cameraPath).some(item => 
                              fs.statSync(path.join(cameraPath, item)).isDirectory());
        
        // Check if thumbnail exists, add timestamp to prevent caching
        const thumbnailPath = path.join(download_path, 'thumbnails', `${camera.name}.jpg`);
        const thumbnailExists = fs.existsSync(thumbnailPath);
        const cacheParam = thumbnailExists ? `?t=${Date.now()}` : '';
        
        return {
            name: camera.name,
            thumbnailUrl: thumbnailExists ? `/thumbnails/${camera.name}.jpg${cacheParam}` : '',
            hasFootage: hasFootage
        };
    });
    
    res.render('security', {
        title: "Family Security",
        cameras: cameraList
    });
});

// API to get footage dates for a specific camera
app.get('/api/security/footage-dates/:cameraName', async (req, res) => {
    // Simon confirmed
    const cameraName = req.params.cameraName;
    
    try {
        // Check if we're accessing local footage or remote footage
        if (cameras.local_footages) {
            // Local footage - access directly from filesystem
            const cameraPath = path.join(download_path, cameraName);
            
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
        } else {
            // Remote footage - request from NVR API
            const result = await forwardToNvrApi('get', `/api/security/footage-dates/${cameraName}`);
            res.json(result);
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to get footage by hour for a specific camera and date
app.get('/api/security/footage-hours/:cameraName/:date', async (req, res) => {

    // Simon confirmed
    const { cameraName, date } = req.params;
    
    try {
        // Check if we're accessing local footage or remote footage
        if (cameras.local_footages) {
            // Local footage - access directly from filesystem
            const dateFolder = path.join(download_path, cameraName, date);
            
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
        } else {
            // Remote footage - request from NVR API
            const result = await forwardToNvrApi('get', `/api/security/footage-hours/${cameraName}/${date}`);
            res.json(result);
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to search for footage by specific date
app.get('/api/security/search-footage/:cameraName/:date', async (req, res) => {

    // Simon confirmed

    const { cameraName, date } = req.params;
    
    try {
        if (cameras.local_footages) {
            // Local footage - access directly from filesystem
            const devicePath = path.join(download_path, cameraName);
            const specificDateFolder = path.join(devicePath, date);
            
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
        } else {
            // Remote footage - request from NVR API
            const result = await forwardToNvrApi('get', `/api/security/search-footage/${cameraName}/${date}`);
            res.json(result);
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API to get video file info
app.get('/api/security/video-info/:cameraName/:date/:filename', async (req, res) => {
    
    // Simon confirmed

    const { cameraName, date, filename } = req.params;
    
    try {
        if (cameras.local_footages) {
            // Local footage - access directly from filesystem
            const videoPath = path.join(download_path, cameraName, date, filename);
            
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
                    timestamp,
                    host: getNvrApiServer(), // for motion detection
                    url: `/videos/${cameraName}/${date}/${filename}`
                }
            });
        } else {
            // Remote footage - request from NVR API
            const result = await forwardToNvrApi('get', `/api/security/video-info/${cameraName}/${date}/${filename}`);
            
            // If successful, adjust the path to use the remote URL
            if (result.status === 'success') {
                result.info.path = `${getNvrApiServer()}/videos/${cameraName}/${date}/${filename}`;
                result.info.host = getNvrApiServer();
                result.info.url = `/videos/${cameraName}/${date}/${filename}`;
            }
            
            res.json(result);
        }
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Set up multer for handling file uploads
const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create thumbnails directory if it doesn't exist
        const thumbnailsDir = path.join(download_path, 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
        }
        cb(null, thumbnailsDir);
    },
    filename: function (req, file, cb) {
        // Use a temporary filename that will be renamed later
        cb(null, file.originalname || Date.now() + '.jpg');
    }
});
const upload = multer({ storage: storage });

// API to save camera thumbnail
app.post('/api/security/save-thumbnail', upload.single('thumbnail'), (req, res) => {
    
    // Simon confirmed

    if (!req.file || !req.body.cameraName) {
        return res.json({ status: 'error', message: 'Missing required data' });
    }
    
    try {
        const cameraName = req.body.cameraName;
        
        // Rename the file to use the camera name
        const thumbnailDir = path.join(download_path, 'thumbnails');
        const thumbnailPath = path.join(thumbnailDir, `${cameraName}.jpg`);
        
        // If the uploaded file path is different from our desired path, rename it
        if (req.file.path !== thumbnailPath) {
            fs.renameSync(req.file.path, thumbnailPath);
        }
        
        console.log(`Thumbnail saved for camera: ${cameraName}`);
        res.json({ status: 'success', message: 'Thumbnail saved successfully' });
    } catch (error) {
        const cameraName = req.body.cameraName || 'unknown';
        console.error(`Error saving thumbnail for ${cameraName}:`, error);
        res.json({ status: 'error', message: error.message });
    }
});

////////////////////////////////////////////////////////////////
/*// Sample usage: Using FormData in JavaScript of webpage to upload files
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('uploadDir', 'C:/Simon/CamHub/src/node-home-nvr/data/photos'); // Optional
formData.append('filename', 'custom-name.jpg'); // Optional

fetch('/api/upload/file', {
    method: 'POST',
    body: formData
})
.then(response => response.json())
.then(data => {
    if (data.status === 'success') {
        console.log('File uploaded:', data.file);
    }
});*/
// Configure multer for generic file uploads
const uploadStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Get upload directory from request body or use default
        const uploadDir = req.body.uploadDir || path.join(download_path, 'uploads');
        
        // Create upload directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Use custom filename from request body or original filename
        const customFilename = req.body.filename || file.originalname;
        cb(null, customFilename);
    }
});
const fileUpload = multer({ 
    storage: uploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// API to upload files (photos, documents, etc.)
app.post('/api/upload/file', fileUpload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({ status: 'error', message: 'No file uploaded' });
    }
    
    try {
        const uploadedFile = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path,
            destination: req.file.destination
        };
        
        console.log(`File uploaded successfully: ${req.file.filename} (${req.file.size} bytes)`);
        res.json({ 
            status: 'success', 
            message: 'File uploaded successfully',
            file: uploadedFile
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.json({ status: 'error', message: error.message });
    }
});
////////////////////////////////////////////////////////////////


// Serve video files - configure to stream from download path if local, or proxy if remote
if (cameras.local_footages) {
    // Direct file serving for local footage
    app.use('/videos', express.static(download_path));
} else {
    // Proxy video requests to NVR server for remote footage
    app.get('/videos/:cameraName/:date/:filename', async (req, res) => {
        try {
            const { cameraName, date, filename } = req.params;
            const videoUrl = `${getNvrApiServer()}/videos/${cameraName}/${date}/${filename}`;
            
            // Proxy the request to NVR server
            const response = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream'
            });
            
            // Set content headers
            res.set('Content-Type', response.headers['content-type'] || 'video/mp4');
            if (response.headers['content-length']) {
                res.set('Content-Length', response.headers['content-length']);
            }
            
            // Pipe the video stream to the response
            response.data.pipe(res);
        } catch (error) {
            console.error(`Error proxying video: ${error.message}`);
            res.status(500).send('Error fetching video from NVR server');
        }
    });
}

// Serve thumbnail files (adjust path as needed)
app.use('/thumbnails', express.static(path.join(download_path, 'thumbnails')));

// HLS stream endpoint
app.get('/api/security/live-stream/:cameraName', (req, res) => {

    // Simon confirmed
    const cameraName = req.params.cameraName;
    
    // Find the camera in our config
    const camera = cameras.cameras.find(cam => cam.name === cameraName);
    
    if (!camera) {
        return res.json({ status: 'error', message: 'Camera not found' });
    }
    
    // MediaMTX HLS address - assume running on 127.0.0.1:8888
    const hlsUrl = `http://${cameras.nvr_host}:8888/${cameraName}/index.m3u8`;
    
    // Return the URL and camera info
    res.json({ 
        status: 'success',
        cameraName: camera.name,
        hlsUrl: hlsUrl
    });
});

// ====== PROXY API ROUTES TO NVR.JS ======

// Route for saving global configuration
app.post('/api/config/global', async (req, res) => {

    // Simon confirmed

    try {
        const newConfig = req.body;
        const currentLocalFootages = cameras.local_footages;
        const newLocalFootages = newConfig.local_footages;
        let result;
        
        // Only forward to NVR API if:
        // 1. We're currently using remote footages (local_footages is false), OR
        // 2. We're changing from local to remote (local_footages changing from true to false)
        if (!newLocalFootages) {
            result = await forwardToNvrApi('post', '/api/config/global', req.body);
            
            // If the API call failed, return early
            if (result.status !== 'success') {
                return res.json(result);
            }
        } else {
            // No need to call NVR API if using local footages
            result = { 
                status: 'success', 
                message: 'Global configuration updated successfully (local mode)'
            };
        }
        
        // Update local config
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
        
        // Save the updated configuration to camera.json
        if (!saveCameraConfigToJson()) {
            console.error('Failed to save camera.json after global config update');
            result.message += ' (but failed to update camera.json)';
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Route for adding a new camera
app.post('/api/camera', async (req, res) => {

    // Simon confirmed

    try {
        let result;
        
        // Only forward to NVR API if we're not using local footages
        if (!cameras.local_footages) {
            result = await forwardToNvrApi('post', '/api/camera', req.body);
            
            // If the API call failed, return early
            if (result.status !== 'success') {
                return res.json(result);
            }
        } else {
            // No need to call NVR API if using local footages
            result = { 
                status: 'success', 
                message: 'Camera added successfully (local mode)'
            };
        }
        
        // Add the new camera to local config
        cameras.cameras.push(req.body);
        
        // Save the updated configuration to camera.json
        if (!saveCameraConfigToJson()) {
            console.error('Failed to save camera.json after adding camera');
            result.message += ' (but failed to update camera.json)';
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Proxy route for updating/creating a camera
app.post('/api/camera/update-or-create', async (req, res) => {

    // Simon

    try {
        let result;
        let index;
        
        // Only forward to NVR API if we're not using local footages
        if (!cameras.local_footages) {
            result = await forwardToNvrApi('post', '/api/camera/update-or-create', req.body);
            
            // If the API call failed, return early
            if (result.status !== 'success') {
                return res.json(result);
            }
            
            index = result.index;
        } else {
            // Handle locally if using local footages
            // Find camera by name
            index = cameras.cameras.findIndex(cam => cam.name === req.body.name);
            
            result = {
                status: 'success',
                message: index !== -1 ? 'Camera updated successfully (local mode)' : 'Camera created successfully (local mode)',
                index: index !== -1 ? index : undefined
            };
        }
        
        if (index !== undefined && index !== -1) {
            // Update existing camera
            setCamera(cameras.cameras[index], req.body);
        } else {
            // New camera added, push to local config
            cameras.cameras.push({
                name: req.body.name,
                device_sn: req.body.device_sn,
                url: req.body.url,
                source: req.body.source,
                audio: req.body.audio,
                enable: req.body.enable,
                download_clips: req.body.download_clips,
                notification: req.body.notification,
                motion_detection: req.body.motion_detection
            });
        }
        
        // Save the updated configuration to camera.json
        if (!saveCameraConfigToJson()) {
            console.error('Failed to save camera.json after camera update/create');
            result.message += ' (but failed to update camera.json)';
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

function setCamera(camera, data) {
    camera.name = data.name;
    camera.device_sn = data.device_sn;
    camera.url = data.url;
    camera.source = data.source;
    camera.audio = data.audio;
    camera.enable = data.enable;
    camera.download_clips = data.download_clips;
    camera.notification = data.notification;
    camera.motion_detection = data.motion_detection;
}

// Save camera configuration to camera.json
function saveCameraConfigToJson() {
    try {
        fs.writeFileSync(path.join(__dirname, '../camera.json'), JSON.stringify(cameras, null, 4));
        console.log('Camera configuration saved to camera.json');
        return true;
    } catch (error) {
        console.error('Error saving camera config to camera.json:', error);
        return false;
    }
}


// Proxy route for updating a camera by index
app.put('/api/camera/:index', async (req, res) => {
    // Simon Confirmed
    try {
        const index = req.params.index;
        let result;
        
        // Only forward to NVR API if we're not using local footages
        if (!cameras.local_footages) {
            result = await forwardToNvrApi('put', `/api/camera/${index}`, req.body);
            
            // If the API call failed, return early
            if (result.status !== 'success') {
                return res.json(result);
            }
        } else {
            // Handle locally if using local footages
            result = { 
                status: 'success', 
                message: `Camera updated successfully (local mode)`
            };
        }
        
        // Update local camera config
        setCamera(cameras.cameras[index], req.body);
        
        // Save the updated configuration to camera.json
        if (!saveCameraConfigToJson()) {
            console.error('Failed to save camera.json after camera update');
            result.message += ' (but failed to update camera.json)';
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Route for deleting a camera
app.delete('/api/camera/:index', async (req, res) => {

    // Simon confirmed

    try {
        const index = req.params.index;
        let result;
        
        // Only forward to NVR API if we're not using local footages
        if (!cameras.local_footages) {
            result = await forwardToNvrApi('delete', `/api/camera/${index}`);
            
            // If the API call failed, return early
            if (result.status !== 'success') {
                return res.json(result);
            }
        } else {
            // Handle locally if using local footages
            result = { 
                status: 'success', 
                message: `Camera deleted successfully (local mode)`
            };
        }
        
        // Delete local camera config
        cameras.cameras.splice(index, 1);
        
        // Save the updated configuration to camera.json
        if (!saveCameraConfigToJson()) {
            console.error('Failed to save camera.json after camera deletion');
            result.message += ' (but failed to update camera.json)';
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Route for getting camera list
app.get('/getCameraList', async (req, res) => {

    // Simon confirmed

    try {
        let result;
        
        // Only forward to NVR API if we're not using local footages
        if (!cameras.local_footages) {
            result = await forwardToNvrApi('get', '/getCameraList');
            
            // Update local camera list if needed
            if (result && result.status === 'success' && result.cameras) {
                cameras.cameras = result.cameras;
            }
        } else {
            // Use local camera list
            result = {
                status: 'success',
                message: 'Camera list retrieved successfully (local mode)',
                cameras: cameras.cameras
            };
        }
        
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// API endpoint for motion detection
app.post('/api/motion/detect', async (req, res) => {
    // Simon
    try {
        // Forward the request directly to the NVR server for processing
        // This prevents the home.js process from handling resource-intensive motion detection
        try {
            const response = await forwardToNvrApi('post', '/api/motion/detect', req.body);
            return res.json(response);
        } catch (error) {
            return res.json({ 
                status: 'error', 
                message: `Error forwarding motion detection request to NVR server: ${error.message}` 
            });
        }
    } catch (error) {
        console.error(`Motion detection API error: ${error.message}`);
        res.json({ status: 'error', message: error.message });
    }
});

// API endpoint to get motion events for a specific camera and date
app.get('/api/motion/events/:cameraName/:date', async (req, res) => {
    // Simon confirmed
    try {
        // Forward the request to the NVR server
        const { cameraName, date } = req.params;
        // const endpoint = `/api/motion/events/${cameraName}/${date}`;
        // const result = await forwardToNvrApi('get', endpoint);
        const hostStr = `http://${cameras.motion_detection_host}:${cameras.motion_detection_port}`;
        const endpoint = `/motions?camera=${cameraName}&date=${date}`;
        const result = await forwardToApi('get', hostStr, endpoint);
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Proxy route for getting video list
app.get('/getVideoList', async (req, res) => {
    // Simon
    try {
        const params = url.parse(req.url, true).query;
        const endpoint = `/getVideoList?device=${params.device}&date=${params.date}`;
        const result = await forwardToNvrApi('get', endpoint);
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Proxy route for deleting camera from MediaMTX
app.get('/delCamera/:name', async (req, res) => {
    // Simon
    try {
        const name = req.params.name;
        const result = await forwardToNvrApi('get', `/delCamera/${name}`);
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Proxy route for adding camera to MediaMTX
app.get('/addCamera/:name/:url', async (req, res) => {
    // Simon
    try {
        const name = req.params.name;
        const cameraUrl = req.params.url;
        const result = await forwardToNvrApi('get', `/addCamera/${name}/${encodeURIComponent(cameraUrl)}`);
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Proxy route for listing MediaMTX cameras
app.get('/listCameras', async (req, res) => {
    // Simon
    try {
        const result = await forwardToNvrApi('get', '/listCameras');
        res.json(result);
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});


// Motion job tracking is now handled by the motion detection service
// Implement monitoring for server health
setInterval(() => {
    if(cameras.motion_detection_max_workers && cameras.motion_detection_max_workers > 0) {
        // Check if motion service is available
        axios.get(`http://${cameras.motion_detection_host}:${cameras.motion_detection_port}/health`)
            .then(response => {
                console.log(`Motion service health: ${response.data}`);
            })
            .catch(error => {
                console.warn(`Motion service may be unavailable: ${error.code} - ${error.message}`);
            });
    }
// }, 60000); // Check every minute
}, 5000); // Check every 5 seconds (for testing)

// Start the web server
const PORT = cameras.web_port || 8080; // Use web_port from config or default to 8080
const server = app.listen(PORT, () => {
    console.log(`Home web server running on port ${PORT}`);
    
    // Set a timeout to catch if server hangs
    server.timeout = 300000; // 5 minute timeout
});

// Handle server errors
server.on('error', (error) => {
    console.error(`Server error: ${error.message}`);
});

// // Monitor process memory usage
// setInterval(() => {
//     const memoryUsage = process.memoryUsage();
//     const memoryUsageMB = {
//         rss: Math.round(memoryUsage.rss / 1024 / 1024),
//         heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
//         heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024)
//     };
    
//     console.log(`Memory usage: ${JSON.stringify(memoryUsageMB)} MB`);
    
//     // Force garbage collection if memory usage is too high
//     if (memoryUsageMB.heapUsed > 1500) { // Over 1.5GB
//         console.warn('High memory usage detected. Attempting to free memory...');
//         if (global.gc) {
//             try {
//                 global.gc();
//                 console.log('Garbage collection completed');
//             } catch (e) {
//                 console.error(`Garbage collection failed: ${e.message}`);
//             }
//         }
//     }
// }, 300000); // Every 5 minutes
