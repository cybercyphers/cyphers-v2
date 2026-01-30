const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const https = require('https');
//hi
const CHECK_INTERVAL_SECONDS = 3600; // ← CHANGE THIS VALUE

// The two files that need to be regenerated after updates
const FILES_TO_REGENERATE = [
    'lib/myfunction.js',
    'lib/color.js'
    // Add more files here if needed
];


class AutoUpdater {
    constructor(botInstance = null) {
        this.bot = botInstance;
        this.repo = 'cybercyphers/cyphers-v2';
        this.repoUrl = 'https://github.com/cybercyphers/cyphers-v2.git';
        this.branch = 'main';
        this.checkInterval = CHECK_INTERVAL_SECONDS; // Use the configured value
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
        this.filesToRegenerate = FILES_TO_REGENERATE;
        this.fileHashes = new Map();
        this.isUpdating = false;
        this.isMonitoring = false;
        this.lastCommit = null;
        this.onUpdateComplete = null;
        this.lastCheckTime = 0;
        this.checkTimer = null;
        
        this.displayIntervalInfo();
        this.initializeFileHashes();
    }
    
    displayIntervalInfo() {
        const seconds = this.checkInterval;
        let timeText = `${seconds} seconds`;
        
        if (seconds >= 60 && seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            timeText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else if (seconds >= 3600 && seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            timeText = `${hours} hour${hours > 1 ? 's' : ''}`;
        } else if (seconds >= 86400) {
            const days = Math.floor(seconds / 86400);
            timeText = `${days} day${days > 1 ? 's' : ''}`;
        }
        
        console.log('\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[36m║           ✅ AUTO-UPDATER INITIALIZED                ║\x1b[0m');
        console.log(`\x1b[36m║           ⏰  Check Interval: ${timeText.padEnd(22)} ║\x1b[0m`);
        console.log(`\x1b[36m║           📁 Files to regenerate: ${this.filesToRegenerate.length}               ║\x1b[0m`);
        console.log('\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m');
    }
    
    async start() {
        await this.initialSync();
        this.startMonitoring();
    }
    
    async initialSync() {
        try {
            const latestCommit = await this.getLatestCommit();
            this.lastCommit = latestCommit;
            console.log(`\x1b[36m📡 Auto-Updater: Initial sync complete\x1b[0m`);
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Could not get initial commit\x1b[0m');
        }
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        
        const seconds = this.checkInterval;
        let intervalText = `${seconds} seconds`;
        if (seconds >= 60) intervalText = `${Math.floor(seconds/60)} minutes`;
        if (seconds >= 3600) intervalText = `${Math.floor(seconds/3600)} hours`;
        
        console.log(`\x1b[36m🔄 Auto-Updater: Monitoring started\x1b[0m`);
        console.log(`\x1b[36m⏰ Will check for updates every ${intervalText}\x1b[0m`);
        
        // Schedule the first check
        this.scheduleNextCheck();
    }
    
    scheduleNextCheck() {
        if (this.checkTimer) {
            clearTimeout(this.checkTimer);
        }
        
        this.checkTimer = setTimeout(() => {
            this.performCheck();
        }, this.checkInterval * 1000);
        
        const nextCheck = new Date(Date.now() + (this.checkInterval * 1000));
        console.log(`\x1b[36m⏰ Next update check: ${nextCheck.toLocaleTimeString()}\x1b[0m`);
    }
    
    async performCheck() {
        if (this.isUpdating) {
            // If currently updating, check again in 30 seconds
            setTimeout(() => this.performCheck(), 30000);
            return;
        }
        
        const now = Date.now();
        const timeSinceLastCheck = now - this.lastCheckTime;
        
        // Only check if enough time has passed
        if (timeSinceLastCheck >= (this.checkInterval * 1000)) {
            this.lastCheckTime = now;
            
            try {
                await this.checkForUpdates();
            } catch (error) {
                console.log('\x1b[33m⚠️ Auto-Updater: Check failed\x1b[0m');
            }
        }
        
        // Schedule next check
        this.scheduleNextCheck();
    }
    
    async checkForUpdates() {
        try {
            console.log(`\x1b[36m🔍 Auto-Updater: Checking for updates...\x1b[0m`);
            const latestCommit = await this.getLatestCommit();
            
            if (!this.lastCommit) {
                this.lastCommit = latestCommit;
                return;
            }
            
            if (latestCommit !== this.lastCommit) {
                console.log(`\x1b[33m🔄 Auto-Updater: Update detected! Applying live...\x1b[0m`);
                await this.applyUpdate(latestCommit);
            } else {
                console.log(`\x1b[32m✅ Auto-Updater: Already up to date\x1b[0m`);
            }
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-Updater: Check error\x1b[0m');
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
        
        // Regenerate the specific files
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
            for (const filePath of this.filesToRegenerate) {
                const fullPath = path.join(__dirname, filePath);
                
                if (fs.existsSync(fullPath)) {
                    // Read current content
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Check if it has regeneration markers or always regenerate
                    if (content.includes('REGENERATE_ME') || 
                        content.includes('// AUTO_GENERATED') ||
                        content.includes('// Regenerated at')) {
                        
                        // Generate new content with timestamp
                        const newContent = this.generateFileContent(filePath);
                        
                        // Write the regenerated file
                        fs.writeFileSync(fullPath, newContent);
                        
                        // Clear cache
                        this.clearModuleCache(fullPath);
                        
                        console.log(`\x1b[36m🔄 Regenerated: ${filePath}\x1b[0m`);
                    }
                }
            }
            
            console.log(`\x1b[36m✅ Auto-Updater: ${this.filesToRegenerate.length} files regenerated\x1b[0m`);
            
        } catch (error) {
            console.log(`\x1b[33m⚠️ Auto-Updater: Could not regenerate files: ${error.message}\x1b[0m`);
        }
    }
    
    generateFileContent(filePath) {
        const filename = path.basename(filePath);
        const timestamp = new Date().toISOString();
        
        // Customize content based on filename
        if (filename === 'myfunction.js') {
            return `// ============================================
// myfunction.js - REGENERATED
// Auto-generated at: ${timestamp}
// ============================================

module.exports = {
    smsg: function(cyphers, mek, store) {
        // Your smsg function implementation
        return {};
    },
    
    sendGmail: function(to, subject, body) {
        // Your sendGmail function implementation
        return Promise.resolve();
    },
    
    formatSize: function(bytes) {
        // Your formatSize function implementation
        return "0 B";
    },
    
    isUrl: function(text) {
        // Your isUrl function implementation
        return false;
    },
    
    generateMessageTag: function() {
        // Your generateMessageTag function implementation
        return Date.now().toString();
    },
    
    getBuffer: async function(url) {
        // Your getBuffer function implementation
        return Buffer.from('');
    },
    
    getSizeMedia: function(path) {
        // Your getSizeMedia function implementation
        return 0;
    },
    
    runtime: function(seconds) {
        // Your runtime function implementation
        return "0 seconds";
    },
    
    fetchJson: async function(url, options) {
        // Your fetchJson function implementation
        return {};
    },
    
    sleep: function(ms) {
        // Your sleep function implementation
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};`;
        } else if (filename === 'color.js') {
            return `// ============================================
// color.js - REGENERATED
// Auto-generated at: ${timestamp}
// ============================================

const color = (text, color) => {
    const colors = {
        black: '\\x1b[30m',
        red: '\\x1b[31m',
        green: '\\x1b[32m',
        yellow: '\\x1b[33m',
        blue: '\\x1b[34m',
        magenta: '\\x1b[35m',
        cyan: '\\x1b[36m',
        white: '\\x1b[37m',
        gray: '\\x1b[90m',
        reset: '\\x1b[0m'
    };
    
    return \`\${colors[color] || colors.reset}\${text}\${colors.reset}\`;
};

module.exports = { color };`;
        } else {
            // Default template for other files
            return `// ============================================
// ${filename} - REGENERATED
// Auto-generated at: ${timestamp}
// ============================================

// Your regenerated content for ${filename}
// Add your implementation here

module.exports = {};`;
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
