const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const https = require('https');

class AutoUpdater {
    constructor(botInstance = null) {
        this.bot = botInstance;
        this.repo = 'cybercyphers/cyphers-v2';
        this.repoUrl = 'https://github.com/cybercyphers/cyphers-v2.git';
        this.branch = 'main';
        this.checkInterval = 10800; // 3 hours
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
        this.fileHashes = new Map();
        this.isUpdating = false;
        this.isMonitoring = false;
        this.lastCommit = null;
        this.onUpdateComplete = null;
        
        console.log('\x1b[36m✅ Auto-Updater: Initialized (Live Updates)\x1b[0m');
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
            console.log('\x1b[36m📡 Auto-Updater: Monitoring for updates (Live Mode)\x1b[0m');
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Could not get initial commit\x1b[0m');
        }
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('\x1b[36m🔄 Auto-Updater: Started monitoring (every 30s - Live Updates)\x1b[0m');
        
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
                await this.applyChanges(tempDir, changes);
                this.lastCommit = newCommit;
                
                // Show summary
                const updated = changes.filter(c => c.type === 'UPDATED').length;
                const added = changes.filter(c => c.type === 'NEW').length;
                
                console.log(`\x1b[36m📦 Auto-Updater: Applied ${updated} updates, ${added} new files (Live)\x1b[0m`);
                
                // Trigger update complete callback
                if (this.onUpdateComplete && typeof this.onUpdateComplete === 'function') {
                    this.onUpdateComplete(changes, newCommit);
                }
                
                console.log('\x1b[32m✅ Auto-Updater: Update applied live without restart\x1b[0m');
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
                
                // Clear require cache for ALL files to ensure hot reload
                // This includes the main file and all dependencies
                if (require.cache[targetPath]) {
                    delete require.cache[targetPath];
                }
                
                // Also clear cache for files that might have been required with different paths
                Object.keys(require.cache).forEach(key => {
                    if (key.includes(change.file) || key === targetPath) {
                        delete require.cache[key];
                    }
                });
                
                // Special handling for deadline.js itself
                if (change.file === 'deadline.js') {
                    console.log('\x1b[33m⚠️ Auto-Updater: Updated itself - changes will apply on next update check\x1b[0m');
                }
                
            } catch (error) {
                console.log(`\x1b[33m⚠️ Could not update ${change.file}: ${error.message}\x1b[0m`);
            }
        }
        
        // Regenerate the two specific files if needed
        await this.regenerateSpecificFiles();
    }
    
    async regenerateSpecificFiles() {
        try {
            // This is where you would regenerate your two specific files
            // Example:
            // 1. Check if certain conditions are met
            // 2. Generate/update the files
            // 3. Clear their cache
            
            // Placeholder for your file regeneration logic
            // const file1 = path.join(__dirname, 'your-first-file.js');
            // const file2 = path.join(__dirname, 'your-second-file.js');
            
            // Your regeneration code here...
            
            console.log('\x1b[36m🔄 Auto-Updater: Regenerated required files\x1b[0m');
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Could not regenerate files\x1b[0m');
        }
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
