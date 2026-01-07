const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const https = require('https');

class RealTimeAutoUpdater {
    constructor(botInstance = null) {
        this.bot = botInstance;
        this.repo = 'cybercyphers/cyphers-v2';
        this.repoUrl = 'https://github.com/cybercyphers/cyphers-v2.git';
        this.branch = 'main';
        this.checkInterval = 5000; // 5 seconds for faster checks
        this.ignoredPatterns = [
            'node_modules',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            'session',
            'tmp',
            'temp',
            'cache',
            '.git',
            '.env',
            'config.js',
            'config.json',
            'auth_info',
            '*.session.json',
            '*.creds.json',
            'backup_*',
            '.cyphers_update_*'
        ];
        this.fileHashes = new Map(); // Track all file hashes
        this.isUpdating = false;
        this.isMonitoring = false;
        this.lastCheckTime = null;
        this.consecutiveFailures = 0;
        
        console.log('\x1b[36m╔════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[36m║           🤖 REAL-TIME AUTO-UPDATER               ║\x1b[0m');
        console.log(`\x1b[36m║      🔗 Repo: ${this.repo.padEnd(30)} ║\x1b[0m`);
        console.log(`\x1b[36m║      ⚡ Check interval: ${this.checkInterval/1000}s         ║\x1b[0m`);
        console.log('\x1b[36m╚════════════════════════════════════════════════════╝\x1b[0m');
        
        // Initialize file hashes
        this.initializeFileHashes();
    }
    
    async start() {
        console.log('\x1b[32m🚀 Starting real-time auto-updater...\x1b[0m');
        
        // Initial sync
        await this.fullSync();
        
        // Start monitoring
        this.startMonitoring();
    }
    
    async initializeFileHashes() {
        console.log('\x1b[36m📊 Building file hash database...\x1b[0m');
        const allFiles = this.getAllFiles(__dirname);
        let count = 0;
        
        for (const file of allFiles) {
            const relativePath = path.relative(__dirname, file);
            if (this.shouldIgnore(relativePath)) continue;
            
            try {
                const hash = this.calculateFileHash(file);
                this.fileHashes.set(relativePath, {
                    hash,
                    size: fs.statSync(file).size,
                    mtime: fs.statSync(file).mtimeMs
                });
                count++;
            } catch (error) {
                // Skip files that can't be read
            }
        }
        
        console.log(`\x1b[32m✅ Tracked ${count} files\x1b[0m`);
    }
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('\x1b[36m🔍 Starting real-time monitoring...\x1b[0m');
        
        // Fast checking loop
        const checkLoop = async () => {
            if (this.isUpdating) {
                setTimeout(checkLoop, 1000);
                return;
            }
            
            try {
                await this.quickCheck();
            } catch (error) {
                console.error('\x1b[33m⚠️ Quick check failed:\x1b[0m', error.message);
                this.consecutiveFailures++;
                
                if (this.consecutiveFailures > 3) {
                    console.log('\x1b[33m🔄 Too many failures, waiting 30 seconds...\x1b[0m');
                    setTimeout(checkLoop, 30000);
                    this.consecutiveFailures = 0;
                    return;
                }
            }
            
            setTimeout(checkLoop, this.checkInterval);
        };
        
        checkLoop();
    }
    
    async quickCheck() {
        const latestCommit = await this.getLatestCommit();
        
        if (!this.lastCommit) {
            this.lastCommit = latestCommit;
            return;
        }
        
        if (latestCommit !== this.lastCommit) {
            console.log(`\x1b[36m⚡ Change detected! Commit: ${latestCommit.substring(0, 8)}\x1b[0m`);
            await this.smartSync(latestCommit);
        }
    }
    
    async smartSync(newCommit) {
        this.isUpdating = true;
        const updateId = Date.now().toString().slice(-6);
        
        try {
            console.log(`\x1b[36m╔════════════════════════════════════════════════════╗\x1b[0m`);
            console.log(`\x1b[36m║           ⚡ SMART SYNC ${updateId}                ║\x1b[0m`);
            console.log(`\x1b[36m║      Detected changes in commit                   ║\x1b[0m`);
            console.log(`\x1b[36m║      ${newCommit.substring(0, 8)}...               ║\x1b[0m`);
            console.log(`\x1b[36m╚════════════════════════════════════════════════════╝\x1b[0m`);
            
            // Step 1: Download only latest changes
            const tempDir = await this.downloadUpdates();
            
            // Step 2: Precise byte-by-byte comparison
            const changes = await this.preciseCompare(tempDir);
            
            if (changes.length === 0) {
                console.log('\x1b[33m⚠️ No file changes detected\x1b[0m');
                this.lastCommit = newCommit;
                this.cleanupTemp(tempDir);
                this.isUpdating = false;
                return;
            }
            
            // Step 3: Apply changes
            await this.applyPreciseChanges(tempDir, changes);
            
            // Step 4: Update commit
            this.lastCommit = newCommit;
            
            // Step 5: Notify
            await this.notifyChanges(changes, newCommit, updateId);
            
            // Step 6: Cleanup
            this.cleanupTemp(tempDir);
            
            console.log(`\x1b[32m✅ Sync ${updateId} completed: ${changes.length} files updated\x1b[0m`);
            
            // Restart bot
            setTimeout(() => {
                this.restartBot(updateId);
            }, 2000);
            
        } catch (error) {
            console.error(`\x1b[31m❌ Sync ${updateId} failed:\x1b[0m`, error.message);
            await this.notifyFailure(error.message, updateId);
            this.isUpdating = false;
        }
    }
    
    async fullSync() {
        console.log('\x1b[36m🔄 Performing full repository sync...\x1b[0m');
        
        try {
            const tempDir = await this.downloadUpdates();
            const changes = await this.preciseCompare(tempDir);
            
            if (changes.length > 0) {
                console.log(`\x1b[33m🔄 Found ${changes.length} outdated files, updating...\x1b[0m`);
                await this.applyPreciseChanges(tempDir, changes);
                await this.notifyChanges(changes, 'initial', 'INIT');
            } else {
                console.log('\x1b[32m✅ Already up to date\x1b[0m');
            }
            
            // Get latest commit
            this.lastCommit = await this.getLatestCommit();
            console.log(`\x1b[32m📌 Now tracking commit: ${this.lastCommit.substring(0, 8)}\x1b[0m`);
            
            this.cleanupTemp(tempDir);
            
        } catch (error) {
            console.error('\x1b[31m❌ Full sync failed:\x1b[0m', error.message);
        }
    }
    
    async preciseCompare(tempDir) {
        const changes = [];
        const repoFiles = this.getAllFiles(tempDir);
        
        // Track files that exist in repo
        const repoFileSet = new Set();
        
        for (const repoFile of repoFiles) {
            const relativePath = path.relative(tempDir, repoFile);
            
            // Skip ignored files
            if (this.shouldIgnore(relativePath)) continue;
            
            repoFileSet.add(relativePath);
            
            const targetPath = path.join(__dirname, relativePath);
            
            // Calculate hash of repo file
            let repoHash, repoSize;
            try {
                const repoContent = fs.readFileSync(repoFile);
                repoHash = crypto.createHash('sha256').update(repoContent).digest('hex');
                repoSize = repoContent.length;
            } catch {
                continue; // Skip if can't read
            }
            
            // Check if file exists locally
            if (fs.existsSync(targetPath)) {
                try {
                    const localContent = fs.readFileSync(targetPath);
                    const localHash = crypto.createHash('sha256').update(localContent).digest('hex');
                    const localSize = localContent.length;
                    
                    // Byte-perfect comparison
                    if (repoHash !== localHash) {
                        changes.push({
                            file: relativePath,
                            type: 'UPDATED',
                            sizeDiff: repoSize - localSize,
                            details: this.getChangeDetails(repoContent, localContent)
                        });
                    }
                } catch {
                    // If can't read local file, mark as updated
                    changes.push({
                        file: relativePath,
                        type: 'UPDATED',
                        sizeDiff: repoSize,
                        details: 'Local file unreadable'
                    });
                }
            } else {
                // New file
                changes.push({
                    file: relativePath,
                    type: 'NEW',
                    size: repoSize
                });
            }
        }
        
        // Check for deleted files (exist locally but not in repo)
        const localFiles = this.getAllFiles(__dirname);
        for (const localFile of localFiles) {
            const relativePath = path.relative(__dirname, localFile);
            
            if (this.shouldIgnore(relativePath)) continue;
            if (relativePath.startsWith('.cyphers_update_')) continue;
            
            if (!repoFileSet.has(relativePath)) {
                // File exists locally but not in repo - mark for deletion
                changes.push({
                    file: relativePath,
                    type: 'DELETED',
                    size: fs.statSync(localFile).size
                });
            }
        }
        
        return changes;
    }
    
    getChangeDetails(newContent, oldContent) {
        const newStr = newContent.toString();
        const oldStr = oldContent.toString();
        
        if (newStr.length !== oldStr.length) {
            return `Size changed: ${oldStr.length} → ${newStr.length} chars`;
        }
        
        // Find first differing character
        for (let i = 0; i < Math.min(newStr.length, oldStr.length); i++) {
            if (newStr[i] !== oldStr[i]) {
                const context = newStr.substring(Math.max(0, i - 20), Math.min(newStr.length, i + 20));
                return `Char ${i} changed: '${oldStr[i]}' → '${newStr[i]}' [...${context}...]`;
            }
        }
        
        return 'Binary content changed';
    }
    
    async applyPreciseChanges(tempDir, changes) {
        let updated = 0;
        let added = 0;
        let deleted = 0;
        
        console.log('\x1b[36m⚡ Applying precise changes...\x1b[0m');
        
        for (const change of changes) {
            const repoPath = path.join(tempDir, change.file);
            const localPath = path.join(__dirname, change.file);
            
            try {
                switch (change.type) {
                    case 'UPDATED':
                    case 'NEW':
                        // Ensure directory exists
                        const dir = path.dirname(localPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        
                        // Copy file with exact bytes
                        const content = fs.readFileSync(repoPath);
                        fs.writeFileSync(localPath, content);
                        
                        // Update hash cache
                        const hash = crypto.createHash('sha256').update(content).digest('hex');
                        this.fileHashes.set(change.file, {
                            hash,
                            size: content.length,
                            mtime: Date.now()
                        });
                        
                        if (change.type === 'UPDATED') updated++;
                        else added++;
                        
                        console.log(`\x1b[33m   ${change.type === 'UPDATED' ? '↪' : '+'} ${change.file}\x1b[0m`);
                        break;
                        
                    case 'DELETED':
                        if (fs.existsSync(localPath)) {
                            fs.unlinkSync(localPath);
                            
                            // Remove from hash cache
                            this.fileHashes.delete(change.file);
                            
                            // Try to remove empty parent directories
                            this.removeEmptyDirs(path.dirname(localPath));
                            
                            deleted++;
                            console.log(`\x1b[31m   - ${change.file}\x1b[0m`);
                        }
                        break;
                }
            } catch (error) {
                console.error(`\x1b[31m   ✗ Failed to ${change.type.toLowerCase()} ${change.file}:\x1b[0m`, error.message);
            }
        }
        
        console.log(`\x1b[32m   ✅ ${updated} updated, ${added} added, ${deleted} deleted\x1b[0m`);
    }
    
    removeEmptyDirs(dir) {
        if (dir === __dirname) return;
        
        try {
            const files = fs.readdirSync(dir);
            if (files.length === 0) {
                fs.rmdirSync(dir);
                this.removeEmptyDirs(path.dirname(dir));
            }
        } catch {
            // Ignore errors
        }
    }
    
    async downloadUpdates() {
        return new Promise((resolve, reject) => {
            const tempDir = path.join(__dirname, '.cyphers_update_' + Date.now());
            
            // Remove old temp dir if exists
            if (fs.existsSync(tempDir)) {
                this.deleteFolderRecursive(tempDir);
            }
            
            console.log('\x1b[36m📥 Downloading latest changes...\x1b[0m');
            
            // Use shallow clone for speed
            const cmd = `git clone --depth 1 --branch ${this.branch} ${this.repoUrl} "${tempDir}"`;
            
            exec(cmd, { timeout: 45000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('\x1b[31m❌ Download failed:\x1b[0m', stderr);
                    reject(new Error('Git clone failed: ' + stderr));
                } else {
                    console.log('\x1b[32m✅ Download complete\x1b[0m');
                    resolve(tempDir);
                }
            });
        });
    }
    
    async getLatestCommit() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${this.repo}/commits/${this.branch}`,
                headers: {
                    'User-Agent': 'Cyphers-RealTime-Updater',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 8000
            };
            
            const req = https.get(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const commit = JSON.parse(data);
                            resolve(commit.sha);
                        } catch {
                            reject(new Error('Failed to parse commit data'));
                        }
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }
    
    getAllFiles(dir, fileList = []) {
        try {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    if (!this.shouldIgnore(file)) {
                        this.getAllFiles(filePath, fileList);
                    }
                } else {
                    if (!this.shouldIgnore(file)) {
                        fileList.push(filePath);
                    }
                }
            }
        } catch {
            // Skip errors
        }
        
        return fileList;
    }
    
    shouldIgnore(filePath) {
        return this.ignoredPatterns.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\./g, '\\.'));
                return regex.test(filePath);
            }
            return filePath.includes(pattern);
        });
    }
    
    calculateFileHash(filePath) {
        try {
            const content = fs.readFileSync(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch {
            return 'error';
        }
    }
    
    async notifyChanges(changes, commit, updateId) {
        if (!this.bot) {
            console.log('\x1b[33m⚠️ Bot not available for notifications\x1b[0m');
            return;
        }
        
        try {
            const message = this.createChangeMessage(changes, commit, updateId);
            console.log('\x1b[36m📢 Change Notification:\x1b[0m');
            console.log(message);
            
            // You can enable this to send WhatsApp notifications
            // await this.bot.sendMessage('your-chat-id', { text: message });
            
        } catch (error) {
            console.error('\x1b[31m❌ Failed to create notification:\x1b[0m', error);
        }
    }
    
    async notifyFailure(error, updateId) {
        if (!this.bot) return;
        
        try {
            const errorMessage = `❌ *Auto-Update Failed*\n\n` +
                                `*Update ID:* ${updateId}\n` +
                                `*Error:* ${error}\n` +
                                `*Time:* ${new Date().toLocaleString()}\n\n` +
                                `Will retry in next check cycle.`;
            
            console.log('\x1b[31m📢 Update Failed:\x1b[0m');
            console.log(errorMessage);
            
        } catch (err) {
            // Ignore notification errors
        }
    }
    
    createChangeMessage(changes, commit, updateId) {
        const date = new Date().toLocaleString();
        const updated = changes.filter(c => c.type === 'UPDATED').length;
        const added = changes.filter(c => c.type === 'NEW').length;
        const deleted = changes.filter(c => c.type === 'DELETED').length;
        const shortCommit = commit.length > 8 ? commit.substring(0, 8) : commit;
        
        let message = `⚡ *REAL-TIME UPDATE ${updateId}*\n\n`;
        message += `📅 *Time:* ${date}\n`;
        message += `🔧 *Commit:* ${shortCommit}\n`;
        message += `📊 *Changes:* ${updated} updated, ${added} added, ${deleted} deleted\n\n`;
        
        if (changes.length > 0) {
            message += `📝 *File Changes:*\n`;
            changes.slice(0, 8).forEach(change => {
                const icon = change.type === 'UPDATED' ? '↪' : 
                            change.type === 'NEW' ? '+' : 
                            change.type === 'DELETED' ? '-' : '?';
                const name = change.file.length > 25 ? '...' + change.file.slice(-22) : change.file;
                message += `${icon} ${name}\n`;
            });
            
            if (changes.length > 8) {
                message += `... and ${changes.length - 8} more\n`;
            }
        }
        
        // Add sample change details
        const sampleChange = changes.find(c => c.type === 'UPDATED' && c.details);
        if (sampleChange && sampleChange.details) {
            message += `\n🔍 *Sample Change:*\n`;
            message += `${sampleChange.details}\n`;
        }
        
        message += `\n✅ *Status:* Updates applied, restarting...`;
        
        return message;
    }
    
    restartBot(updateId) {
        console.log(`\x1b[36m🔄 Restarting bot after update ${updateId}...\x1b[0m`);
        
        // Spawn new process
        const child = spawn(process.argv[0], process.argv.slice(1), {
            stdio: 'inherit',
            detached: true,
            env: { ...process.env, CYPHERS_AUTO_UPDATED: 'true' }
        });
        
        child.unref();
        
        // Exit current process
        setTimeout(() => {
            console.log('\x1b[32m✅ Launching updated version...\x1b[0m');
            process.exit(0);
        }, 1000);
    }
    
    cleanupTemp(tempDir) {
        try {
            if (fs.existsSync(tempDir)) {
                this.deleteFolderRecursive(tempDir);
            }
        } catch {
            // Ignore cleanup errors
        }
    }
    
    deleteFolderRecursive(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.readdirSync(dirPath).forEach((file) => {
                const curPath = path.join(dirPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dirPath);
        }
    }
}

module.exports = RealTimeAutoUpdater;
