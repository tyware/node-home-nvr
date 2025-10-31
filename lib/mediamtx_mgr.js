const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const utils = require("./utils.js");


class MediaMTXManager {
    constructor(configYmlPath, mediamtxPath) {
        this.configYmlPath = configYmlPath;
        this.mediamtxPath = mediamtxPath;
        this.process = null;
        this.baseURL = 'http://127.0.0.1:9997';
        this.isRunning = false;
    }

    // Start MediaMTX as child process
    async start() {
        return new Promise((resolve, reject) => {
            if (this.process) {
                reject(new Error('[MediaMTX mgr] MediaMTX is already running'));
                return;
            }

            this.process = spawn(this.mediamtxPath, [this.configYmlPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(this.mediamtxPath)
            });

            this.process.stdout.on('data', (data) => {
                const str = `[MediaMTX data] ${data.toString().trim()}`;
                console.log(str);
                utils.log("MediaMTX", str);
            });

            this.process.stderr.on('data', (data) => {
                const str = `[MediaMTX error] ${data.toString().trim()}`;
                console.error(str);
                utils.log("MediaMTX", str);
                console.error();
            });

            this.process.on('close', (code) => {
                const str = `[MediaMTX close] Process exited with code ${code}`;
                console.log(str);
                utils.log("MediaMTX", str);
                this.process = null;
                this.isRunning = false;
            });

            this.process.on('error', (err) => {
                const str = `[MediaMTX error] Failed to start process: ${err}`;
                console.error(str);
                utils.log("MediaMTX", str);
                reject(err);
            });

            // Wait for MediaMTX to be ready
            setTimeout(() => {
                this.isRunning = true;
                resolve();
            }, 2000);
        });
    }

    // Stop MediaMTX
    async stop() {
        return new Promise((resolve) => {
            if (!this.process) {
                resolve();
                return;
            }

            this.process.on('close', () => {
                this.process = null;
                this.isRunning = false;
                resolve();
            });

            this.process.kill('SIGTERM');
            
            // Force kill after 5 seconds
            setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                }
            }, 5000);
        });
    }

    // Restart MediaMTX
    async restart() {
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.start();
    }

    // // Create default configuration
    // createDefaultConfig() {
    //     fs.writeFileSync(this.configYmlPath, defaultConfig);
    //     utils.log("MediaMTX", `[MediaMTX mgr] Created default config at ${this.configYmlPath}`);
    //     console.log(`[MediaMTX mgr] Created default config at ${this.configYmlPath}`);
    // }

    // HTTP API Methods
    async makeAPIRequest(endpoint, method = 'GET', data = null) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const config = {
                method,
                url,
                timeout: 5000
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            utils.log("MediaMTX", `API[MediaMTX mgr] request failed: ${error.message}`);
            throw new Error(`[MediaMTX mgr] API request failed: ${error.message}`);
        }
    }

    // Get all paths/streams
    async getPaths() {
        return await this.makeAPIRequest('/v3/paths/list');
    }

    // Get specific path details
    async getPath(pathName) {
        return await this.makeAPIRequest(`/v3/paths/get/${pathName}`);
    }

    // get connected rtsps
    async getRTSPConnections() {
        return await this.makeAPIRequest('/v3/rtspconns/list');
    }

    // get rtsp sessions
    async getRTSPSessions() {
        return await this.makeAPIRequest('/v3/rtspsessions/list');
    }

    // Get configuration
    async getConfig() {
        return await this.makeAPIRequest('/v3/config/global/get');
    }

    // // Get server metrics
    // async getMetrics() {
    //     return await this.makeAPIRequest('/v3/metrics');
    // }

    async getConfigPaths() {
        return await this.makeAPIRequest('/v3/config/paths/list');
    }

    // Add/update a camera path
    async addCamera(pathName, config) {
        const defaultConfig = {
            source: config.source || 'publisher',
            sourceOnDemand: config.sourceOnDemand || false,
            sourceProtocol: config.sourceProtocol || 'automatic'
        };

        return await this.makeAPIRequest(`/v3/config/paths/add/${pathName}`, 'POST', defaultConfig);
    }

    // Delete a camera path
    async deleteCamera(pathName) {
        return await this.makeAPIRequest(`/v3/config/paths/delete/${pathName}`, 'DELETE');
    }

    // Replace entire configuration
    async updateConfig(newConfig) {
        return await this.makeAPIRequest('/v3/config/global/patch', 'PATCH', newConfig);
    }

    // Get RTSP sessions
    async getSessions() {
        return await this.makeAPIRequest('/v3/sessions/list');
    }

    // Health check
    async healthCheck() {
        try {
            await this.makeAPIRequest('/v3/metrics');
            return true;
        } catch {
            return false;
        }
    }

    // Monitor streams with callback
    async monitorStreams(callback, interval = 3000) {
        this.monitorInterval = setInterval(async () => {
            try {
                const paths = await this.getPaths();
                // const rtspSessions = await this.getRTSPSessions();
                
                callback({
                    paths,
                    // rtspSessions,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                callback({
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }, interval);
    }

    // Stop monitoring
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }

    // Get process status
    getStatus() {
        return {
            isRunning: this.isRunning,
            pid: this.process ? this.process.pid : null
        };
    }
}

module.exports = {
    MediaMTXManager
};
