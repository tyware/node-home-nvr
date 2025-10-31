const { spawn } = require('child_process');
const WebSocket = require('ws');
const { path: ffmpegPath } = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require("fs");
const axios = require('axios');

class RtspStream {

    constructor(options) {
        this.options = {
            cameras: options.cameras,
            camera: options.camera,
            url: options.url,
            target: options.target || './current/',
            segmentTime: options.segmentTime || 120,
            audio: options.audio !== false,
            ...options
        };

        this.useAAC = options.camera.useAAC; // Start with copy mode
        
        this.stream = null;
        this.clientCount = 0;
        this.isRunning = false;
        this.reconnectAttempts = 0;
        this.nasFileName = null;
        
        this.setupErrorHandling();
    }

    setupErrorHandling() {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            console.error('[RTSP-STREAM] Uncaught exception:', error);
        });
    }

    async start() {
        if (this.isRunning) {
            console.log('[RTSP-STREAM] Stream is already running');
            return new Promise.resolve();
        }

        this.isRunning = true;
        return this.startFFmpeg();
    }

    clearCurrentFolder() { 
        const currentPath = path.join(this.options.target, 'current');
        if(fs.existsSync(currentPath )) {
            let files = fs.readdirSync(currentPath);
            files.forEach(function(file,index){
                fs.unlinkSync(path.join(currentPath, file));
            });
        }
    }

    async startFFmpeg() {

        return new Promise((resolve, reject) => {
            // clear the current folder
            this.nasFileName = null;

            const baseArgs = [
                '-i', this.options.url,
            ];

            const streamMapping = [
                '-map', '0:v' // Always map video
            ];

            if (this.options.audio) {
                streamMapping.push('-map', '0:a?'); // Optional audio
            }

            const codecArgs = [
                '-c:v', 'copy' // Copy video codec
            ];

            if (this.options.audio) {
                if(this.useAAC) {
                    codecArgs.push('-c:a', 'aac');
                } else {
                    codecArgs.push('-c:a', 'copy');
                }
            } else {
                codecArgs.push('-an'); // No audio
            }

            const recordingArgs = [
                '-f', 'segment',
                '-segment_time', '120',
                '-reset_timestamps', '1',
                '-strftime', '1',
                '-segment_format', 'mp4',
                '-movflags', 'frag_keyframe+empty_moov+separate_moof',
                path.join(this.options.target, 'current', '%Y%m%d-%H%M%S-120.mp4')
            ];

            // Relay (only active when consumed)
            const streamingArgs = [];
            // [
            //     '-f', 'mp4',
            //     '-movflags', 'frag_keyframe+empty_moov+separate_moof',
            //     'pipe:1'  // stdout - it will block when no one reads from stdout
            // ];

            const args = [
                ...baseArgs,
                ...streamMapping,
                ...codecArgs,
                ...recordingArgs,
                ...streamingArgs
            ];

            this.stream = spawn(ffmpegPath, args, {
                detached: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'] // stdout is a pipe that can block
            });

            // Handle logs and errors (stderr)
            this.stream.stderr.on('data', (data) => {
                const output = data.toString();
                this.processFFmpegOutput(output);
            });

            // Handle process events
            this.stream.on('close', (code) => {
                console.log(`[RTSP-STREAM] this.stream.on('close') exited with code ${code}`);
                this.stream = null;
                this.reconnect();
            });
        
            this.stream.on('disconnect', () => console.warn("disconnected: " + this.options.url));
            this.stream.on('exit', (_code, signal) => {
                console.warn("[RTSP-STREAM] this.stream.on('exit'): " + this.options.url);
            });

            this.stream.on('error', (error) => {
                console.error('[RTSP-STREAM] FFmpeg process error:', error);
                this.handleError('Process error');
            });

            console.log('[RTSP-STREAM] FFmpeg started successfully: ' + this.options.url);
            resolve();
        });
    }

    processFFmpegOutput(output) {

        const filePathMatch = output.match(/Opening\s+'([^']+\.mp4)'/);
        if (filePathMatch) {
            this.nasFileName = filePathMatch[1];
            this.moveCurrentFile(this.nasFileName);
            this.reconnectAttempts = 0;
            console.log('[RTSP-STREAM] Current clip file: ' + this.nasFileName);
        }
        else {
            const lines = output.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Detect errors
                if(!this.useAAC && trimmed.includes('codec not currently supported in container')) {
                    console.log('[RTSP-STREAM] Unsupported codec detected, restarting with AAC transcoding...');
                    this.options.camera.useAAC = true;
                    this.stream.kill(); // will trigger 'close' event
                    // this.stream = null;
                    console.log('[RTSP-STREAM] Restart stream with AAC ...');
                }
                else if (trimmed.includes('Connection refused') ||
                    trimmed.includes('Unable to open') ||
                    trimmed.includes('Server returned') ||
                    trimmed.includes('Input/output error') ||
                    trimmed.includes('Conversion failed')) {
                    console.error('[RTSP-STREAM] FFmpeg error detected:', trimmed);
                    this.handleError(trimmed);
                }
            }
        }
    }

    handleError(error) {
        // console.error('[RTSP-STREAM] Stream error:', error);
        console.log("   " + this.options.url);

        if (this.stream) {
            this.stream.kill('SIGTERM'); // will trigger 'close' event
        }
    }

    reconnect() {
        this.reconnectAttempts++;
        return; // MediaMTXService will handle restarts in monitoring
    }

    stop() {
        console.log('[RTSP-STREAM] Stopping rtsp stream...');
        this.isRunning = false;
        this.reconnectAttempts = 0;
        
        if (this.stream) {
            this.stream.kill('SIGTERM');
            this.stream = null;
        }
    }

    shutdown() {
        console.log('[RTSP-STREAM] Shutting down...');
        console.log(`       ${this.options.url}`);
        this.stop();
        
        // Force exit after 3 seconds
        setTimeout(() => {
            console.log('[RTSP-STREAM] Forced shutdown');
            process.exit(1);
        }, 3000);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            clientCount: this.clientCount,
            reconnectAttempts: this.reconnectAttempts,
            hasFFmpeg: this.stream !== null
        };
    }

    // Move files from "current" to dated folders except the current file
    moveCurrentFile(curFileName) {
        let curDir = path.join(this.options.target, "current");
        let files = fs.readdirSync(curDir);
        let newNasFileName = curFileName.substr(curFileName.length - 23, 23);
        for (let i = 0; i < files.length; i++) {
            if(newNasFileName !== files[i]) {
                let dateStr = files[i].substr(0, 8);
                let theirDir = path.join(this.options.target, dateStr);
                let filePath = path.join(curDir, files[i]);
                let destinationPath;
                
                // Create the dated directory if it doesn't exist
                if (!fs.existsSync(theirDir)) {
                    fs.mkdirSync(theirDir, { recursive: true });
                }
                
                // Check file size - skip small files that might be corrupt
                const stats = fs.lstatSync(filePath);
                if(stats.size < 64000) {
                    fs.unlinkSync(filePath);
                    continue;
                }
                
                destinationPath = path.join(theirDir, files[i]);
                
                // Move the file
                fs.rename(filePath, destinationPath, (err) => {
                    // Check for errors during move
                    if (err) {
                        console.error(`[RTSP-STREAM] Error moving file ${filePath} to ${destinationPath}: ${err.message}`);
                        return;
                    }
                    
                    // After successfully moving the file, check if motion detection is enabled for this camera
                    if (this.options.cameras.motion_detection_max_workers > 0 && this.options.camera && this.options.camera.motion_detection) {
                        console.log(`[RTSP-STREAM] Triggering motion detection for ${files[i]}`);
                        console.log(`[RTSP-STREAM] Path: ${destinationPath}`);
                        this.triggerMotionDetection(dateStr, files[i]);
                    }
                });
            }
        };
    }
    
    // Trigger motion detection for a moved file
    triggerMotionDetection(dateStr, fileName) {
        // Skip if motion detection is not enabled for this camera
        if (!this.options.camera.motion_detection) {
            console.log(`[RTSP-STREAM] Motion detection skipped for ${this.options.camera.name} (not enabled)`);
            return;
        }

        // Construct the URL using motion_detection_host and motion_detection_port from configuration
        const url = `http://${this.options.cameras.motion_detection_host}:${this.options.cameras.motion_detection_port}/detect`;
        
        // Prepare the data payload
        const data = {
            camera: this.options.camera.name,
            date: dateStr,
            filename: fileName
        };
        
        console.log(`[RTSP-STREAM] Triggering motion detection for ${fileName} from camera ${this.options.camera.name}`);
        
        // Make the POST request to the motion detection service
        axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            console.log(`[RTSP-STREAM] Motion detection triggered successfully for ${fileName}`);
            if (response.data && response.data.detections) {
                console.log(`[RTSP-STREAM] Detected ${response.data.detections.length} objects`);
            }
        })
        .catch(error => {
            console.error(`[RTSP-STREAM] Error triggering motion detection for ${fileName}: ${error.message}`);
            if (error.response) {
                console.error(`[RTSP-STREAM] Error details: ${JSON.stringify(error.response.data)}`);
            }
        });
    }

}

exports.rtsp_stream = RtspStream;