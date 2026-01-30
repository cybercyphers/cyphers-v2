const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const https = require('https');
//nice one
class AutoUpdater {
    constructor(botInstance = null) {
        this.bot = botInstance;
        this.repo = 'cybercyphers/cyphers-v2';
        this.repoUrl = 'https://github.com/cybercyphers/cyphers-v2.git';
        this.branch = 'main';
        this.checkInterval = 10800; //  3 hours😊
        this.ignoredPatterns = [
            'node_modules',
            'package-lock.json',
            'yarn.lock',
            '.git',
            '.env',
            '*.log',
            'session',
            'auth_info',
            '*.session.json',
            '*.creds.json',
            'temp/',
            'tmp/',
            'config.js'
        ];
        this.protectedFiles = [
            'config.js',
            'settings/config.js',
            'data/'
        ];
        this.restartRequiredFiles = [
            'cyph.js',
            'main.js',
            'index.js',
            'package.json',
            'deadline.js',
            'node_modules/'
        ];
        this.fileHashes = new Map();
        this.isUpdating = false;
        this.isMonitoring = false;
        this.lastCommit = null;
        this.onUpdateComplete = null;
        this.updateFlagFile = path.join(__dirname, '.update_pending.flag');
        this.restartDelay = 3000; // 3 seconds before restart
        
        console.log('\x1b[36m✅ Auto-Updater: Initialized\x1b[0m');
        this.initializeFileHashes();
    }
    
    async start() {
        await this.initialSync();
        this.startMonitoring();
    }
    
    async initialSync() {
        try {
            const latestCommit = await this.getLatestCommit();
            this.lastCommit = latestCommit;
            console.log('\x1b[36m📡 Auto-Updater: Monitoring for updates\x1b[0m');
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Could not get initial commit\x1b[0m');
        }
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('\x1b[36m🔄 Auto-Updater: Started monitoring (every 30s)\x1b[0m');
        
        const checkLoop = async () => {
            if (this.isUpdating) {
                setTimeout(checkLoop, 1000);
                return;
            }
            
            try {
                await this.checkForUpdates();
            } catch (error) {
                // Silent error
            }
            
            setTimeout(checkLoop, this.checkInterval);
        };
        
        checkLoop();
    }
    
    async checkForUpdates() {
        try {
            const latestCommit = await this.getLatestCommit();
            
            if (!this.lastCommit) {
                this.lastCommit = latestCommit;
                return;
            }
            
            if (latestCommit !== this.lastCommit) {
                await this.applyUpdate(latestCommit);
            }
        } catch (error) {
            // Silent error
        }
    }
    
    async applyUpdate(newCommit) {
        if (this.isUpdating) return;
        this.isUpdating = true;
        
        try {
            const tempDir = await this.downloadUpdate();
            const changes = await this.compareFiles(tempDir);
            
            if (changes.length > 0) {
                const needsRestart = await this.applyChanges(tempDir, changes);
                this.lastCommit = newCommit;
                
                // Only show the summary
                const updated = changes.filter(c => c.type === 'UPDATED').length;
                const added = changes.filter(c => c.type === 'NEW').length;
                
                console.log(`\x1b[36m📦 Auto-Updater: ${updated} updated, ${added} added\x1b[0m`);
                
                // Trigger update complete callback
                if (this.onUpdateComplete && typeof this.onUpdateComplete === 'function') {
                    this.onUpdateComplete(changes, newCommit);
                }
                
                // If restart is needed, do it
                if (needsRestart) {
                    await this.scheduleRestart();
                } else {
                    console.log('\x1b[32m✅ Auto-Updater: Update applied (hot reload)\x1b[0m');
                }
            } else {
                this.lastCommit = newCommit;
            }
            
            this.cleanupTemp(tempDir);
            
        } catch (error) {
            console.log('\x1b[31m❌ Auto-Updater: Update failed\x1b[0m');
        } finally {
            this.isUpdating = false;
        }
    }
    
    async downloadUpdate() {
        return new Promise((resolve, reject) => {
            const tempDir = path.join(__dirname, '.update_temp_' + Date.now());
            
            exec(`git clone --depth 1 --branch ${this.branch} ${this.repoUrl} "${tempDir}"`, 
                { timeout: 60000 }, 
                (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(tempDir);
                    }
                }
            );
        });
    }
    
    async compareFiles(tempDir) {
        const changes = [];
        const repoFiles = this.getAllFiles(tempDir);
        
        for (const repoFile of repoFiles) {
            const relativePath = path.relative(tempDir, repoFile);
            if (this.shouldIgnore(relativePath)) continue;
            
            const targetPath = path.join(__dirname, relativePath);
            
            if (fs.existsSync(targetPath)) {
                const repoHash = this.calculateFileHash(repoFile);
                const localHash = this.calculateFileHash(targetPath);
                
                if (repoHash !== localHash) {
                    changes.push({
                        file: relativePath,
                        type: 'UPDATED',
                        path: targetPath
                    });
                }
            } else {
                changes.push({
                    file: relativePath,
                    type: 'NEW',
                    path: targetPath
                });
            }
        }
        
        return changes;
    }
    
    async applyChanges(tempDir, changes) {
        let needsRestart = false;
        
        for (const change of changes) {
            const repoPath = path.join(tempDir, change.file);
            const targetPath = change.path;
            
            try {
                // Create directory if it doesn't exist
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Copy file
                fs.copyFileSync(repoPath, targetPath);
                
                // Check if this file requires a restart
                if (this.requiresRestart(change.file)) {
                    needsRestart = true;
                }
                
                // Clear require cache for hot reload
                if (require.cache[targetPath]) {
                    delete require.cache[targetPath];
                }
                
            } catch (error) {
                console.log(`\x1b[33m⚠️ Could not update ${change.file}\x1b[0m`);
            }
        }
        
        return needsRestart;
    }
    
    requiresRestart(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        
        // Check if it's a core file
        const coreFiles = ['cyph.js', 'main.js', 'index.js', 'package.json', 'deadline.js'];
        if (coreFiles.some(f => fileName.includes(f))) {
            return true;
        }
        
        // Check if it's in node_modules
        if (filePath.includes('node_modules')) {
            return true;
        }
        
        return false;
    }
    
    async scheduleRestart() {
        console.log('\x1b[33m⚠️ Auto-Updater: Restart required for update\x1b[0m');
        console.log('\x1b[33m🔄 Auto-Updater: Restarting in 3 seconds...\x1b[0m');
        
        // Create update flag
        fs.writeFileSync(this.updateFlagFile, Date.now().toString());
        
        // Wait and restart
        setTimeout(() => {
            this.restartBot();
        }, this.restartDelay);
    }
    
    restartBot() {
        console.log('\x1b[32m🚀 Auto-Updater: Starting new bot process...\x1b[0m');
        
        const [node, script, ...args] = process.argv;
        
        const child = spawn(node, [script, ...args], {
            cwd: process.cwd(),
            detached: true,
            stdio: 'inherit'
        });
        
        child.unref();
        
        // Exit current process
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
    
    async getLatestCommit() {
        return new Promise((resolve) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${this.repo}/commits/${this.branch}`,
                headers: {
                    'User-Agent': 'Auto-Updater',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 5000
            };
            
            const req = https.get(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const commit = JSON.parse(data);
                            resolve(commit.sha);
                        } catch {
                            resolve(Date.now().toString());
                        }
                    } else {
                        resolve(Date.now().toString());
                    }
                });
            });
            
            req.on('error', () => resolve(Date.now().toString()));
            req.on('timeout', () => {
                req.destroy();
                resolve(Date.now().toString());
            });
        });
    }
    
    getAllFiles(dir) {
        const files = [];
        
        try {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    if (!this.shouldIgnore(item)) {
                        files.push(...this.getAllFiles(fullPath));
                    }
                } else {
                    if (!this.shouldIgnore(item)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Silent error
        }
        
        return files;
    }
    
    shouldIgnore(fileName) {
        return this.ignoredPatterns.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(fileName);
            }
            return fileName.includes(pattern);
        });
    }
    
    calculateFileHash(filePath) {
        try {
            const content = fs.readFileSync(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch {
            return '';
        }
    }
    
    cleanupTemp(tempDir) {
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            // Silent cleanup
        }
    }
    
    initializeFileHashes() {
        const files = this.getAllFiles(__dirname);
        
        for (const file of files) {
            const relativePath = path.relative(__dirname, file);
            const hash = this.calculateFileHash(file);
            this.fileHashes.set(relativePath, hash);
        }
    }
}

module.exports = AutoUpdater;
