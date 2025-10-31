const { MediaMTXManager } = require('./mediamtx_mgr.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const utils = require("./utils.js");
const { rtsp_stream } = require("./rtsp_stream.js");

const defaultConfigHeader =
    `api: yes
apiAddress: :9997

# Enable Prometheus-compatible metrics.
metrics: yes
# Address of the metrics HTTP listener.
metricsAddress: :9998

rtspAddress: :8554

hls: yes
hlsAddress: :8888
hlsAllowOrigin: '*'
hlsVariant: fmp4

paths:
`;
let defaultConfigPaths =
    `
    #camera_Japan:
    #  source: rtsp://220.254.72.200/Src/MediaInput/h264/stream_1/ch_
    #  sourceOnDemand: no
        
    #camera2:
    #  source: rtsp://camera2-ip:554/stream
    #  sourceOnDemand: yes

    # Stream from FFmpeg
    #ffmpeg-stream:
    #    source: publisher
 `;

const media_mtx_path = path.join(__dirname, '..', 'mediamtx', os.platform() === 'win32' ? 'mediamtx.exe' : 'mediamtx');
const media_mtx_config_file_path = path.join(__dirname, '..', 'mediamtx', 'mediamtx.yml');


// let defaultConfig = defaultConfigHeader + defaultConfigPaths;

class MediaMTXService {
    constructor(cameras = {}) {
        this.pathsStats = [];
        this.configPaths = [];
        this.cameras = cameras;
        this.cameras.cameras.forEach(camera => {
            if (camera.enable) {
                this.configPaths.push({
                    name: camera.name,
                    source: camera.source || 'publisher',
                    sourceOnDemand: camera.sourceOnDemand || false
                });
            }
        });
        this.updateYmlConfig();
        this.manager = new MediaMTXManager(media_mtx_config_file_path, media_mtx_path);
        this.isMonitoring = false;
    }

    async startService() {

        return new Promise((resolve, reject) => {
            this.manager.start().then(() => {

                // Start monitoring
                this.manager.monitorStreams(this.monitorStreams.bind(this));
                this.isMonitoring = true;

                this.refreshStats();

                this.manager.getConfigPaths().then((data) => {
                    this.configPaths = [];
                    data.items.forEach(element => {
                        this.configPaths.push({
                            name: element.name,
                            source: element.source,
                            sourceOnDemand: element.sourceOnDemand ? 'yes' : 'no'
                        });
                    });
                }).catch((e) => {
                    utils.log("MediaMTX", `[MediaMTX mgr] Failed to get config paths: ${e.message}`);
                    console.error("[MediaMTX mgr] Failed to get config paths:", e);
                });

                utils.log("MediaMTX", '[MediaMTX mgr] MediaMTX service started and monitoring');
                console.log('[MediaMTX mgr] MediaMTX service started and monitoring');

                resolve();
            });
        });
    }

    async stopService() {
        this.manager.stopMonitoring();
        await this.manager.stop();
        this.isMonitoring = false;
        console.log('[MediaMTX svr] MediaMTX service stopped');
        utils.log("MediaMTX", '[MediaMTX svr] MediaMTX service stopped');
    }

    refreshStats() {
        this.manager.getPaths().then((data) => {
            this.monitorStreams({ paths: data });
        }).catch((e) => {
            utils.log("MediaMTX", `[MediaMTX svr] Failed to refresh paths: ${e.message}`);
            console.error("[MediaMTX svr] Failed to refresh paths:", e);
        });
    }

    createFFmpegStream(nas_path, camera) {

        const rtsp_path = path.join(nas_path, camera.name);

        if (!fs.existsSync(path.join(rtsp_path, 'current')))
            fs.mkdirSync(path.join(rtsp_path, 'current'), { recursive: true });

        let rtsp = new rtsp_stream({
            cameras: this.cameras,
            camera: camera,
            name: camera.name,
            url: camera.url,
            target: rtsp_path,
            audio: camera.audio
        });

        // console.log('HOME: Starting FFmpeg stream for camera:', camera.name);

        rtsp.start().then(() => {
            console.log("[MediaMTX svr] streaming started: " + camera.url);
            utils.log("MediaMTX", "[MediaMTX svr] streaming started: " + camera.url);
        }).catch((e) => {
            console.error("[MediaMTX svr] streaming error: " + camera.url + " - " + e);
            utils.log("MediaMTX", "[MediaMTX svr] streaming error: " + camera.url + " - " + e);
        });
    }

    monitorRtspSessions(pathsStats) {
        const nas_path = path.join(this.cameras.download_path, "NAS");
        pathsStats.forEach(path => {
            if (path.ready && path.readers?.length <= 0) {
                const camera = this.cameras.cameras.filter(item => item.name === path.name);
                if(camera && camera.length > 0) {
                    this.createFFmpegStream(nas_path, camera[0]);
                }
            }
        });
    }

    monitorStreams(data) {
        if (data.error) {
            console.error('[MediaMTX svr] Monitoring error:', data.error);
            utils.log("MediaMTX", `[MediaMTX svr] Monitoring error: ${data.error}`);
            return;
        }

        // Process stream data
        this.pathsStats = data.paths.items;
        this.monitorRtspSessions(this.pathsStats)
        // this.rtspSessions = data.rtspSessions.items;

        // const activeStreams = data.paths.items.filter(item => item.ready);
        // console.log(`Active streams: ${activeStreams.length}`);

        // You can add custom logic here:
        // - Alert when streams go down
        // - Log performance metrics
        // - Auto-restart failed streams
    }

    updateYmlConfig() {
        defaultConfigPaths = "";
        this.configPaths.forEach(item => {
            defaultConfigPaths += `  ${item.name}:\n    source: ${item.source}\n    sourceOnDemand: ${item.sourceOnDemand}\n\n`;
        });

        try {
            fs.writeFileSync(media_mtx_config_file_path, defaultConfigHeader + defaultConfigPaths);
        } catch (error) {
            console.error(`[MediaMTX mgr]Failed to update YAML config:`, error);
            utils.log("MediaMTX", `[MediaMTX mgr] Failed to update YAML config: ${error.message}`);
        }
    }

    // delete camera
    async deleteCamera(name) {
        try {
            const left = this.configPaths.filter(item => item.name !== name);
            if (left.length === this.configPaths.length) {
                console.log(`[MediaMTX mgr] Camera ${name} does not exist in config`);
                utils.log("MediaMTX", `[MediaMTX mgr] Camera ${name} does not exist in config`);
                return false;
            }
            this.configPaths = left;
            this.updateYmlConfig();
            console.log(`[MediaMTX mgr] Camera ${name} deleted`);
            utils.log("MediaMTX", `[MediaMTX mgr] Camera ${name} deleted`);
            return true;
        } catch (error) {
            console.error(`[MediaMTX mgr]Failed to delete camera ${name}:`, error);
            utils.log("MediaMTX", `[MediaMTX mgr]Failed to delete camera ${name}: ${error.message}`);
            return false;
        }
    }

    // Add camera with validation
    addCameraWithValidation(name, source) {
        try {
            // Validate source format
            if (!source.startsWith('rtsp://') && source !== 'publisher') {
                console.error(`[MediaMTX mgr]Invalid source format for camera ${name}: ${source}`);
                utils.log("MediaMTX", `[MediaMTX mgr] Invalid source format for camera ${name}: ${source}`);
                return false;
            }
            else {
                if (this.configPaths.filter(item => item.name === name || item.source === source).length > 0) {
                    console.log(`[MediaMTX mgr] either Camera ${name} or source ${source} already exists in config`);
                    utils.log("MediaMTX", `[MediaMTX mgr] either Camera ${name} or source ${source} already exists in config`);
                    return false;
                }
                else {
                    this.configPaths.push({
                        name: name,
                        source: source,
                        sourceOnDemand: 'no'
                    });
                    this.updateYmlConfig();
                    console.log(`[MediaMTX mgr] Camera ${name} with source ${source} added`);
                    utils.log("MediaMTX", `[MediaMTX mgr] Camera ${name} with source ${source} added`);
                    return true;
                }
            }

        } catch (error) {
            console.error(`[MediaMTX mgr]Failed to add camera ${name}:`, error);
            utils.log("MediaMTX", `[MediaMTX mgr]Failed to add camera ${name}: ${error.message}`);
            return false;
        }
    }

    // Get stream statistics
    async getStreamStats() {
        const paths = await this.manager.getPaths();

        return {
            totalStreams: paths.items.length,
            activeStreams: paths.items.filter(p => p.ready).length,
        };
    }
}

module.exports = {
    MediaMTXService
};
