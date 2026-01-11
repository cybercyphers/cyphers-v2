console.clear();
const fs = require('fs');
const path = require('path');
const readline = require("readline");

// ==================== WORKING AUTO-UPDATER (DEADLINE.JS) ====================
// This uses your existing deadline.js which already works perfectly
let AutoUpdater = null;

// ==================== USER AGREEMENT SYSTEM ====================
function checkConfigForAllowUpdates() {
    try {
        const configPath = path.join(__dirname, './settings/config.js');
        
        if (!fs.existsSync(configPath)) {
            return '_'; // Config doesn't exist, show agreement
        }
        
        const configContent = fs.readFileSync(configPath, 'utf8');
        const lines = configContent.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('global.allowUpdates')) {
                const match = trimmed.match(/global\.allowUpdates\s*=\s*(.*?);/);
                if (match) {
                    const value = match[1].trim();
                    if (value === 'true') return true;
                    if (value === 'false') return false;
                    if (value === '_' || value === "''" || value === '""') return '_';
                    try {
                        const parsed = JSON.parse(value);
                        if (typeof parsed === 'boolean') return parsed;
                    } catch {
                        if (value.toLowerCase() === 'true') return true;
                        if (value.toLowerCase() === 'false') return false;
                    }
                }
            }
        }
        return '_';
    } catch (error) {
        return '_';
    }
}

async function saveAllowUpdatesToConfig(allowUpdates) {
    try {
        const configPath = path.join(__dirname, './settings/config.js');
        
        let configContent = '';
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }
        
        if (configContent.includes('global.allowUpdates')) {
            configContent = configContent.replace(
                /global\.allowUpdates\s*=\s*.*?;/,
                `global.allowUpdates = ${allowUpdates};`
            );
        } else {
            const lines = configContent.split('\n');
            let insertIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('global.')) {
                    insertIndex = i + 1;
                } else if (lines[i].trim().length > 0 && !lines[i].trim().startsWith('//')) {
                    break;
                }
            }
            lines.splice(insertIndex, 0, `global.allowUpdates = ${allowUpdates};`);
            configContent = lines.join('\n');
        }
        
        fs.writeFileSync(configPath, configContent, 'utf8');
        console.log(`\x1b[32m✅ Auto-update preference saved\x1b[0m`);
    } catch (error) {
        console.log(`\x1b[33m⚠️  Could not save config: ${error.message}\x1b[0m`);
    }
}

async function getUserAgreement() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    console.clear();
    console.log('\x1b[36m┌──────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[36m│              CYPHERS-v2 AUTO-UPDATE                     │\x1b[0m');
    console.log('\x1b[36m│                                                         │\x1b[0m');
    console.log('\x1b[36m│     ⚡ REAL-TIME UPDATES ENABLED                         │\x1b[0m');
    console.log('\x1b[36m│     • Checks GitHub for updates                         │\x1b[0m');
    console.log('\x1b[36m│     • Applies updates automatically                     │\x1b[0m');
    console.log('\x1b[36m│     • No spam or duplicate files                        │\x1b[0m');
    console.log('\x1b[36m│     • Only downloads when needed                        │\x1b[0m');
    console.log('\x1b[36m│                                                         │\x1b[0m');
    console.log('\x1b[36m│     🔥 This is the SAME SYSTEM as before                │\x1b[0m');
    console.log('\x1b[36m│     ✅ Already tested and working perfectly             │\x1b[0m');
    console.log('\x1b[36m│                                                         │\x1b[0m');
    console.log('\x1b[36m│     Do you want to enable auto-updates?                │\x1b[0m');
    console.log('\x1b[36m│     (y) Yes - Same as before (Recommended)             │\x1b[0m');
    console.log('\x1b[36m│     (n) No - Manual updates only                       │\x1b[0m');
    console.log('\x1b[36m└──────────────────────────────────────────────────────────┘\x1b[0m');
    
    return new Promise((resolve) => {
        rl.question('\x1b[33mChoose (y/n): \x1b[0m', (answer) => {
            rl.close();
            const enabled = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
            resolve(enabled);
        });
    });
}

async function checkAndSetup() {
    try {
        console.clear();
        
        // Check config first
        const configStatus = checkConfigForAllowUpdates();
        
        // If config has a boolean value (true/false), return it without asking
        if (configStatus === true || configStatus === false) {
            console.log('\x1b[36m✅ Using saved auto-update setting\x1b[0m');
            console.log(`\x1b[36mAuto-updates: ${configStatus ? 'ENABLED' : 'DISABLED'}\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return configStatus;
        }
        
        // If config has '_' or doesn't exist, show agreement
        console.log('\x1b[36mFirst time setup - Agreement required\x1b[0m');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Run the agreement setup
        const autoUpdateEnabled = await getUserAgreement();
        
        // Save the setting to config
        await saveAllowUpdatesToConfig(autoUpdateEnabled);
        
        // Clear screen and show success
        console.clear();
        console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
        console.log('\x1b[32m│        ✅ AGREEMENT ACCEPTED                           │\x1b[0m');
        console.log(`\x1b[32m│        Auto-updates: ${autoUpdateEnabled ? 'ENABLED' : 'DISABLED'}                   │\x1b[0m`);
        
        if (autoUpdateEnabled) {
            console.log('\x1b[32m│        ⚡ Using PROVEN update system                   │\x1b[0m');
            console.log('\x1b[32m│        🔥 Same as working version                     │\x1b[0m');
            console.log('\x1b[32m│        ✅ No spam, no duplicate files                 │\x1b[0m');
        }
        
        console.log('\x1b[32m│        Starting CYPHERS-v2...                         │\x1b[0m');
        console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        return autoUpdateEnabled;
        
    } catch (error) {
        console.log('\x1b[31m❌ Agreement setup failed: ' + error.message + '\x1b[0m');
        console.log('\x1b[33m⚠️  Starting with default settings (auto-updates enabled)...\x1b[0m');
        return true;
    }
}

// ==================== CLEANUP FUNCTION ====================
function cleanupOldTempFiles() {
    try {
        const currentDir = __dirname;
        const files = fs.readdirSync(currentDir);
        
        // Clean up any old temp files from failed updates
        const tempPatterns = [
            /^update_temp_\d+$/,
            /^temp_update_\d+$/,
            /^\.update_temp_\d+$/
        ];
        
        for (const file of files) {
            try {
                const filePath = path.join(currentDir, file);
                const stat = fs.statSync(filePath);
                
                const isTempFile = tempPatterns.some(pattern => pattern.test(file));
                
                if (isTempFile && stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                }
            } catch (err) {
                continue;
            }
        }
    } catch (error) {
        // Silent cleanup
    }
}

// ==================== MAIN BOT STARTUP ====================
async function startBot() {
    // Clean up old temp files first
    cleanupOldTempFiles();
    
    // Check agreement/config first
    const autoUpdateEnabled = await checkAndSetup();
    
    // Now load config
    const configPath = require.resolve('./settings/config');
    delete require.cache[configPath];
    require('./settings/config');
    
    // Ensure global.allowUpdates exists
    global.allowUpdates = autoUpdateEnabled;
    
    // Show current setting
    console.clear();
    console.log(`\x1b[36mAuto-updates: ${global.allowUpdates ? 'ENABLED ✅' : 'DISABLED ❌'}\x1b[0m`);
    
    // ============ LOAD THE WORKING AUTO-UPDATER ============
    let autoUpdater = null;
    
    if (global.allowUpdates) {
        try {
            // Load your existing deadline.js which already works
            AutoUpdater = require('./deadline');
            console.log('\x1b[32m✅ Loaded working auto-updater system\x1b[0m');
        } catch (error) {
            console.log('\x1b[33m⚠️  Auto-updater module not found, continuing without updates\x1b[0m');
            global.allowUpdates = false;
        }
    } else {
        console.log('\x1b[33m⚠️  Auto-updates disabled by user choice\x1b[0m');
    }

    // Load Baileys and other dependencies
    const { 
        default: makeWASocket, 
        useMultiFileAuthState, 
        DisconnectReason, 
        makeInMemoryStore, 
        jidDecode, 
        downloadContentFromMessage, 
        makeCacheableSignalKeyStore
    } = require("@whiskeysockets/baileys");

    const pino = require('pino');
    const { Boom } = require('@hapi/boom');
    const { color } = require('./lib/color');
    const { smsg } = require('./lib/myfunction');

    // Add fetch polyfill if needed
    if (typeof globalThis.fetch !== 'function') {
        try {
            globalThis.fetch = require('node-fetch');
        } catch {
            globalThis.fetch = async (url) => {
                const https = require('https');
                return new Promise((resolve, reject) => {
                    https.get(url, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            resolve({
                                json: () => Promise.resolve(JSON.parse(data))
                            });
                        });
                    }).on('error', reject);
                });
            };
        }
    }

    const usePairingCode = true;
    const question = (text) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((resolve) => { rl.question(text, resolve) });
    }

    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    // Global variables
    let plugins = {};
    let pluginWatchers = {};
    let loadedPlugins = new Set();
    let cyphersInstance = null;
    let botRestarting = false;

    // Check if this is a restart after auto-update
    if (process.env.CYPHERS_AUTO_UPDATED === 'true') {
        console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
        console.log('\x1b[32m│        ✅ VERIFIED UPDATE                              │\x1b[0m');
        console.log('\x1b[32m│        Running latest version now ⚡                   │\x1b[0m');
        console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
        delete process.env.CYPHERS_AUTO_UPDATED;
    }

    // Function to load plugins
    function loadPlugins(reload = false) {
        const pluginsDir = path.join(__dirname, 'plugins');
        
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
            return;
        }
        
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => 
            file.endsWith('.js') || file.endsWith('.cjs')
        );
        
        if (!reload) {
            plugins = {};
            loadedPlugins.clear();
        }
        
        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                
                if (reload) {
                    delete require.cache[require.resolve(pluginPath)];
                }
                
                const plugin = require(pluginPath);
                
                if (!plugin.name || !plugin.execute) {
                    continue;
                }
                
                plugins[plugin.name] = plugin;
                
                if (!loadedPlugins.has(plugin.name)) {
                    loadedPlugins.add(plugin.name);
                }
                
            } catch (error) {
                console.log(`⚠️  Failed to load plugin ${file}: ${error.message}`);
            }
        }
    }

    // Function to read version from file
    function getVersionFromFile() {
        try {
            const versionFile = path.join(__dirname, 'version.txt');
            if (fs.existsSync(versionFile)) {
                const version = fs.readFileSync(versionFile, 'utf8').trim();
                return version || 'CYPHERS-v2';
            }
            return 'CYPHERS-v2';
        } catch (error) {
            return 'CYPHERS-v2';
        }
    }

    async function cyphersStart() {
        if (botRestarting) return;
        botRestarting = true;
        
        const { state, saveCreds } = await useMultiFileAuthState("session");
        
        const cyphers = makeWASocket({
            printQRInTerminal: !usePairingCode,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            generateHighQualityLinkPreview: true,
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );
                if (requiresPatch) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadataVersion: 2,
                                    deviceListMetadata: {},
                                },
                                ...message,
                            },
                        },
                    };
                }
                return message;
            },
            version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            logger: pino({ level: 'fatal' }),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino().child({
                    level: 'silent',
                    stream: 'store'
                })),
            }
        });

        cyphersInstance = cyphers;
        cyphers.public = global.status !== undefined ? global.status : true;

        if (usePairingCode && !cyphers.authState.creds.registered) {
            const phoneNumber = await question('Enter bot phone number 🥲 : Example 233xxx\n');
            const code = await cyphers.requestPairingCode(phoneNumber, "CYPHERSS");
            console.log(`\x1b[1;33mPairing Code: ${code}\x1b[0m`);
        }

        store.bind(cyphers.ev);
        
        // ============ INITIALIZE THE WORKING AUTO-UPDATER ============
        if (global.allowUpdates && AutoUpdater) {
            if (!autoUpdater) {
                const versionInfo = getVersionFromFile();
                console.log('\x1b[36m┌──────────────────────────────────────────────────────────┐\x1b[0m');
                console.log('\x1b[36m│            ' + versionInfo + '                      │\x1b[0m');
                console.log('\x1b[36m└──────────────────────────────────────────────────────────┘\x1b[0m');
                
                // Create and start the auto-updater (YOUR WORKING SYSTEM)
                autoUpdater = new AutoUpdater(cyphers);
                
                // Set up update complete callback (optional)
                if (autoUpdater.onUpdateComplete) {
                    autoUpdater.onUpdateComplete = async (changes, commitHash) => {
                        const updatedVersion = getVersionFromFile();
                        console.log('\x1b[32m' + updatedVersion + '\x1b[0m');
                        console.log('✅ Update complete!');
                    };
                }
                
                // Start the auto-updater - THIS IS YOUR WORKING SYSTEM
                autoUpdater.start();
                
                console.log('\x1b[32m✅ Working auto-updater activated!\x1b[0m');
                console.log('\x1b[36m🔄 Using proven update system (no spam)\x1b[0m');
            } else {
                autoUpdater.bot = cyphers;
            }
        } else if (global.allowUpdates && !AutoUpdater) {
            console.log('\x1b[33m⚠️  Auto-updater module not available\x1b[0m');
        }
        
        loadPlugins();
        
        cyphers.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') 
                    ? mek.message.ephemeralMessage.message 
                    : mek.message;
                
                if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
                if (!cyphers.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
                
                const m = smsg(cyphers, mek, store);
                const messageText = m.body?.toLowerCase() || '';
                const prefix = global.prefix || '.';
                
                if (messageText.startsWith(prefix)) {
                    const args = messageText.slice(prefix.length).trim().split(/ +/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = Object.values(plugins).find(p => p.name.toLowerCase() === commandName);
                    
                    if (plugin) {
                        try {
                            const msgObj = {
                                key: {
                                    remoteJid: m.chat,
                                    fromMe: m.key?.fromMe || false,
                                    id: m.id,
                                    participant: m.sender
                                },
                                message: m.message,
                                pushName: m.pushName,
                                timestamp: m.timestamp,
                                sender: m.sender,
                                body: m.body,
                                quoted: m.quoted || null
                            };
                            
                            await plugin.execute(cyphers, msgObj, args);
                        } catch (error) {
                            console.log(color(`Error in ${plugin.name}: ${error.message}`, 'red'));
                        }
                    }
                }
            } catch (err) {
                console.log(color(`Message error: ${err}`, 'red'));
            }
        });

        cyphers.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {};
                return decode.user && decode.server && decode.user + '@' + decode.server || jid;
            } else return jid;
        };

        cyphers.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = cyphers.decodeJid(contact.id);
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
            }
        });
        
        // Channel IDs (same as your working version)
        global.idch1 = "https://whatsapp.com/channel/0029Vb7KKdB8V0toQKtI3n2j";
        global.idch2 = "https://whatsapp.com/channel/0029VbBjA7047XeKSb012y3j";

        cyphers.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                console.log(color('Connection closed:', 'deeppink'), lastDisconnect.error?.message || 'Unknown');
                
                if (!lastDisconnect?.error) {
                    console.log(color('No error, restarting...', 'yellow'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.badSession) {
                    console.log(color(`Bad Session, delete session and scan again`));
                    process.exit();
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log(color('Connection closed, reconnecting...', 'deeppink'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log(color('Connection lost, reconnecting', 'deeppink'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.connectionReplaced) {
                    console.log(color('Connection replaced, close current session first'));
                    cyphers.logout();
                    botRestarting = false;
                    setTimeout(cyphersStart, 5000);
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log(color(`Logged out, scan again`));
                    cyphers.logout();
                } else if (reason === DisconnectReason.restartRequired) {
                    console.log(color('Restart required...'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.timedOut) {
                    console.log(color('Timed out, reconnecting...'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else {
                    console.log(color('Unknown disconnect reason, reconnecting...', 'yellow'));
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                }
            } else if (connection === "connecting") {
                console.clear();
                console.log(color('Connecting...', 'cyan'));
            } else if (connection === "open") {
                console.clear();
                
                // Subscribe to channels
                try {
                    await cyphers.newsletterFollow(global.idch1);
                    console.log(color(`✅ Channel 1 subscribed`, 'green'));
                } catch (error) {
                    console.log(color(`✗ Failed Channel 1: ${error.message}`, 'yellow'));
                }
                
                try {
                    await cyphers.newsletterFollow(global.idch2);
                    console.log(color(`✅ Channel 2 subscribed`, 'green'));
                } catch (error) {
                    console.log(color(`✗ Failed Channel 2: ${error.message}`, 'yellow'));
                }
                
                const versionInfo = getVersionFromFile();
                
                console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
                console.log('\x1b[32m│             ✅ ' + versionInfo + '                    │\x1b[0m');
                console.log(`\x1b[32m│     📦 ${Object.keys(plugins).length} plugins loaded                        │\x1b[0m`);
                console.log('\x1b[32m│     ⚡  Live updates by cybercyphers                          │\x1b[0m');
                console.log(`\x1b[32m│     🔄 Auto-updates: ${global.allowUpdates ? 'Enabled ✅' : 'Disabled ❌'}                     │\x1b[0m`);
                
                if (global.allowUpdates) {
                    console.log('\x1b[32m│     ⚡ Using PROVEN update system                    │\x1b[0m');
                    console.log('\x1b[32m│     ✅ No spam, no duplicate files                  │\x1b[0m');
                }
                
                console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
                
                botRestarting = false;
            }
        });

        cyphers.sendText = (jid, text, quoted = '', options) => 
            cyphers.sendMessage(jid, { text: text, ...options }, { quoted });
        
        cyphers.downloadMediaMessage = async (message) => {
            let mime = (message.msg || message).mimetype || '';
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(message, messageType);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            return buffer;
        };
        
        cyphers.ev.on('creds.update', saveCreds);
        return cyphers;
    }

    // Start the bot
    cyphersStart().catch(error => {
        console.error(color('Failed to start bot:', 'red'), error);
        process.exit(1);
    });

    // Watch main file for changes
    let file = require.resolve(__filename);
    fs.watchFile(file, () => {
        fs.unwatchFile(file);
        console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
        delete require.cache[file];
        require(file);
    });
}

// Start everything
startBot().catch(error => {
    console.error('\x1b[31mFailed to start bot:', error.message, '\x1b[0m');
    process.exit(1);
});
