const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const CHECK_INTERVAL_SECONDS = 3600;
const FILES_TO_REGENERATE = ['lib/myfunction.js', 'lib/color.js'];

class AutoUpdater {
    constructor(botInstance = null) {
        this.bot = botInstance;
        this.repo = 'cybercyphers/cyphers-v2';
        this.repoUrl = 'https://github.com/cybercyphers/cyphers-v2.git';
        this.branch = 'main';
        this.checkInterval = CHECK_INTERVAL_SECONDS;
        this.ignoredPatterns = [
            'node_modules', 'package-lock.json', 'yarn.lock', '.git', '.env',
            '*.log', 'session', 'auth_info', '*.session.json', '*.creds.json',
            'temp/', 'tmp/', 'config.js'
        ];
        this.protectedFiles = ['config.js', 'settings/config.js', 'data/'];
        this.filesToRegenerate = FILES_TO_REGENERATE;
        this.fileHashes = new Map();
        this.isUpdating = false;
        this.isMonitoring = false;
        this.lastCommit = null;
        this.onUpdateComplete = null;
        this.checkTimer = null;
        
        console.log(`\x1b[36m✅ Auto-Updater: Will check every ${this.getIntervalText()}\x1b[0m`);
        this.initializeFileHashes();
    }
    
    getIntervalText() {
        const seconds = this.checkInterval;
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds/60)} minutes`;
        if (seconds < 86400) return `${Math.floor(seconds/3600)} hours`;
        return `${Math.floor(seconds/86400)} days`;
    }
    
    async start() {
        await this.initialSync();
        this.startMonitoring();
    }
    
    async initialSync() {
        try {
            this.lastCommit = await this.getLatestCommit();
        } catch (error) {}
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        
        console.log(`\x1b[36m🔄 Auto-Updater: Monitoring started\x1b[0m`);
        
        // WAIT for the full interval before first check
        setTimeout(() => {
            this.performCheck();
        }, this.checkInterval * 1000);
    }
    
    async performCheck() {
        if (this.isUpdating) {
            setTimeout(() => this.performCheck(), 30000);
            return;
        }
        
        console.log(`\x1b[36m🔍 Checking for updates...\x1b[0m`);
        
        try {
            const latestCommit = await this.getLatestCommit();
            
            if (!this.lastCommit) {
                this.lastCommit = latestCommit;
                this.scheduleNextCheck();
                return;
            }
            
            if (latestCommit !== this.lastCommit) {
                console.log(`\x1b[33m🔄 Update detected!\x1b[0m`);
                await this.applyUpdate(latestCommit);
            } else {
                console.log(`\x1b[32m✅ Up to date\x1b[0m`);
            }
        } catch (error) {}
        
        this.scheduleNextCheck();
    }
    
    scheduleNextCheck() {
        if (this.checkTimer) clearTimeout(this.checkTimer);
        
        const nextCheckTime = Date.now() + (this.checkInterval * 1000);
        const nextCheckDate = new Date(nextCheckTime);
        
        this.checkTimer = setTimeout(() => {
            this.performCheck();
        }, this.checkInterval * 1000);
        
        console.log(`\x1b[36m⏰ Next check: ${nextCheckDate.toLocaleTimeString()}\x1b[0m`);
    }
    
    async applyUpdate(newCommit) {
        if (this.isUpdating) return;
        this.isUpdating = true;
        
        try {
            const tempDir = await this.downloadUpdate();
            const changes = await this.compareFiles(tempDir);
            
            if (changes.length > 0) {
                const reloadedModules = await this.applyChanges(tempDir, changes);
                this.lastCommit = newCommit;
                
                const updated = changes.filter(c => c.type === 'UPDATED').length;
                const added = changes.filter(c => c.type === 'NEW').length;
                
                console.log(`\x1b[36m📦 Updated ${updated} files, added ${added} files\x1b[0m`);
                console.log(`\x1b[36m🔄 Reloaded ${reloadedModules.length} modules\x1b[0m`);
                
                if (this.onUpdateComplete) {
                    this.onUpdateComplete(changes, newCommit);
                }
                
                console.log('\x1b[32m✅ Update applied live\x1b[0m');
            } else {
                this.lastCommit = newCommit;
                console.log('\x1b[33m⚠️ No file changes\x1b[0m');
            }
            
            this.cleanupTemp(tempDir);
            
        } catch (error) {
            console.log('\x1b[31m❌ Update failed\x1b[0m');
        } finally {
            this.isUpdating = false;
        }
    }
    
    async downloadUpdate() {
        return new Promise((resolve, reject) => {
            const tempDir = path.join(__dirname, '.update_temp_' + Date.now());
            exec(`git clone --depth 1 --branch ${this.branch} ${this.repoUrl} "${tempDir}"`, 
                { timeout: 60000 }, 
                (error) => error ? reject(error) : resolve(tempDir)
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
        const reloadedModules = [];
        
        for (const change of changes) {
            const repoPath = path.join(tempDir, change.file);
            const targetPath = change.path;
            
            try {
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.copyFileSync(repoPath, targetPath);
                console.log(`\x1b[32m✓ ${change.file}\x1b[0m`);
                
                this.clearModuleCache(targetPath);
                
                const affectedModules = this.findDependentModules(targetPath);
                for (const modulePath of affectedModules) {
                    try {
                        if (fs.existsSync(modulePath)) {
                            delete require.cache[require.resolve(modulePath)];
                            require(modulePath);
                            reloadedModules.push(modulePath);
                        }
                    } catch (err) {}
                }
                
            } catch (error) {
                console.log(`\x1b[33m⚠️ ${change.file}: ${error.message}\x1b[0m`);
            }
        }
        
        await this.regenerateSpecificFiles();
        return reloadedModules;
    }
    
    clearModuleCache(filePath) {
        if (require.cache[filePath]) {
            delete require.cache[filePath];
        }
        
        const moduleName = path.basename(filePath, '.js');
        Object.keys(require.cache).forEach(key => {
            if (key.includes(filePath) || path.basename(key, '.js') === moduleName) {
                delete require.cache[key];
            }
        });
    }
    
    findDependentModules(updatedFilePath) {
        const dependentModules = new Set();
        const updatedFileName = path.basename(updatedFilePath, '.js');
        
        Object.keys(require.cache).forEach(modulePath => {
            try {
                const module = require.cache[modulePath];
                if (module && module.children) {
                    for (const child of module.children) {
                        if (child.filename === updatedFilePath || child.filename.includes(updatedFileName)) {
                            dependentModules.add(modulePath);
                            break;
                        }
                    }
                }
            } catch (err) {}
        });
        
        return Array.from(dependentModules);
    }
    
    async regenerateSpecificFiles() {
        try {
            for (const filePath of this.filesToRegenerate) {
                const fullPath = path.join(__dirname, filePath);
                
                if (fs.existsSync(fullPath)) {
                    const timestamp = new Date().toISOString();
                    const filename = path.basename(filePath);
                    
                    let newContent = '';
                    if (filename === 'myfunction.js') {
                        newContent = `// Regenerated at ${timestamp}
module.exports = { smsg, sendGmail, formatSize, isUrl, generateMessageTag, getBuffer, getSizeMedia, runtime, fetchJson, sleep };`;
                    } else if (filename === 'color.js') {
                        newContent = `// Regenerated at ${timestamp}
const color = (text, color) => \`\\x1b[\\${color}m\${text}\\x1b[0m\`;
module.exports = { color };`;
                    } else {
                        newContent = `// Regenerated at ${timestamp}
module.exports = {};`;
                    }
                    
                    fs.writeFileSync(fullPath, newContent);
                    this.clearModuleCache(fullPath);
                    console.log(`\x1b[36m🔄 ${filePath}\x1b[0m`);
                }
            }
            
        } catch (error) {
            console.log(`\x1b[33m⚠️ Could not regenerate files\x1b[0m`);
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
        } catch (error) {}
        
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
        } catch (error) {}
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
