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
        this.checkInterval = 3600; // Default: 3600 seconds = 1 hour
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
        
        console.log(`\x1b[36m✅ Auto-Updater: Initialized (Live Updates - Check every ${this.checkInterval} seconds)\x1b[0m`);
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
            console.log(`\x1b[36m📡 Auto-Updater: Monitoring for updates (Every ${this.checkInterval} seconds)\x1b[0m`);
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Could not get initial commit\x1b[0m');
        }
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        const intervalMinutes = Math.floor(this.checkInterval / 60);
        console.log(`\x1b[36m🔄 Auto-Updater: Started monitoring (every ${this.checkInterval} seconds ≈ ${intervalMinutes} minutes)\x1b[0m`);
        
        const checkLoop = async () => {
            if (this.isUpdating) {
                setTimeout(checkLoop, 5000); // Check again in 5 seconds if updating
                return;
            }
            
            try {
                await this.checkForUpdates();
            } catch (error) {
                // Silent error
            }
            
            setTimeout(checkLoop, this.checkInterval * 1000); // Convert seconds to milliseconds
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
                console.log(`\x1b[33m🔄 Auto-Updater: Update detected! Applying live...\x1b[0m`);
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
                const reloadedModules = await this.applyChanges(tempDir, changes);
                this.lastCommit = newCommit;
                
                // Show summary
                const updated = changes.filter(c => c.type === 'UPDATED').length;
                const added = changes.filter(c => c.type === 'NEW').length;
                
                console.log(`\x1b[36m📦 Auto-Updater: Applied ${updated} updates, ${added} new files\x1b[0m`);
                console.log(`\x1b[36m🔄 Auto-Updater: Reloaded ${reloadedModules.length} modules live\x1b[0m`);
                
                // Trigger update complete callback
                if (this.onUpdateComplete && typeof this.onUpdateComplete === 'function') {
                    this.onUpdateComplete(changes, newCommit);
                }
                
                console.log('\x1b[32m✅ Auto-Updater: Update applied live without restart\x1b[0m');
            } else {
                this.lastCommit = newCommit;
                console.log('\x1b[33m⚠️ Auto-Updater: No file changes detected\x1b[0m');
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
                        path: targetPath,
                        hash: repoHash
                    });
                }
            } else {
                changes.push({
                    file: relativePath,
                    type: 'NEW',
                    path: targetPath,
                    hash: this.calculateFileHash(repoFile)
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
                // Create directory if it doesn't exist
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Backup current file content before overwriting
                let oldContent = null;
                if (fs.existsSync(targetPath)) {
                    oldContent = fs.readFileSync(targetPath, 'utf8');
                }
                
                // Copy file
                fs.copyFileSync(repoPath, targetPath);
                console.log(`\x1b[32m✓ Updated: ${change.file}\x1b[0m`);
                
                // Clear require cache for the updated file
                this.clearModuleCache(targetPath);
                
                // Find and reload all modules that depend on this file
                const affectedModules = this.findDependentModules(targetPath);
                for (const modulePath of affectedModules) {
                    try {
                        if (fs.existsSync(modulePath)) {
                            delete require.cache[require.resolve(modulePath)];
                            require(modulePath);
                            reloadedModules.push(modulePath);
                            console.log(`\x1b[36m↻ Reloaded: ${path.relative(__dirname, modulePath)}\x1b[0m`);
                        }
                    } catch (err) {
                        console.log(`\x1b[33m⚠️ Could not reload ${modulePath}: ${err.message}\x1b[0m`);
                    }
                }
                
            } catch (error) {
                console.log(`\x1b[33m⚠️ Could not update ${change.file}: ${error.message}\x1b[0m`);
            }
        }
        
        // Regenerate the two specific files
        await this.regenerateSpecificFiles();
        
        return reloadedModules;
    }
    
    clearModuleCache(filePath) {
        // Clear the specific file from cache
        if (require.cache[filePath]) {
            delete require.cache[filePath];
        }
        
        // Also clear by module name pattern
        const moduleName = path.basename(filePath, '.js');
        Object.keys(require.cache).forEach(key => {
            if (key.includes(filePath) || 
                key.includes(moduleName) ||
                path.basename(key, '.js') === moduleName) {
                delete require.cache[key];
            }
        });
    }
    
    findDependentModules(updatedFilePath) {
        const dependentModules = new Set();
        const updatedFileName = path.basename(updatedFilePath, '.js');
        const updatedDir = path.dirname(updatedFilePath);
        
        // Check all cached modules to see if they depend on the updated file
        Object.keys(require.cache).forEach(modulePath => {
            try {
                const module = require.cache[modulePath];
                if (module && module.children) {
                    // Check if this module requires the updated file
                    for (const child of module.children) {
                        if (child.filename === updatedFilePath ||
                            child.filename.includes(updatedFileName) ||
                            child.filename.startsWith(updatedDir)) {
                            dependentModules.add(modulePath);
                            break;
                        }
                    }
                }
            } catch (err) {
                // Skip modules that can't be analyzed
            }
        });
        
        return Array.from(dependentModules);
    }
    
    async regenerateSpecificFiles() {
        try {
            // First specific file regeneration
            const file1 = path.join(__dirname, 'lib/myfunction.js');
            if (fs.existsSync(file1)) {
                // Check if it needs regeneration based on content
                const content = fs.readFileSync(file1, 'utf8');
                if (content.includes('REGENERATE_ME') || content.includes('// AUTO_GENERATED')) {
                    // Your regeneration logic here
                    const newContent = `// Regenerated at ${new Date().toISOString()}
// Your regenerated content here
module.exports = {
    smsg, sendGmail, formatSize, isUrl, generateMessageTag, 
    getBuffer, getSizeMedia, runtime, fetchJson, sleep
};`;
                    fs.writeFileSync(file1, newContent);
                    console.log('\x1b[36m🔄 Regenerated: lib/myfunction.js\x1b[0m');
                    this.clearModuleCache(file1);
                }
            }
            
            // Second specific file regeneration
            const file2 = path.join(__dirname, 'lib/color.js');
            if (fs.existsSync(file2)) {
                // Check if it needs regeneration
                const content = fs.readFileSync(file2, 'utf8');
                if (content.includes('REGENERATE_ME') || content.includes('// AUTO_GENERATED')) {
                    // Your regeneration logic here
                    const newContent = `// Regenerated at ${new Date().toISOString()}
// Color functions
module.exports = { color };`;
                    fs.writeFileSync(file2, newContent);
                    console.log('\x1b[36m🔄 Regenerated: lib/color.js\x1b[0m');
                    this.clearModuleCache(file2);
                }
            }
            
            console.log('\x1b[36m✅ Auto-Updater: Specific files regenerated and reloaded\x1b[0m');
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
