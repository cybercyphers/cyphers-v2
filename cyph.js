console.clear();

// 1. First, read config.js to check for global.allowUpdates
const fs = require('fs');
const path = require('path');

// Function to safely parse config.js
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
                    if (value === '_') return '_';
                    
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value.toLowerCase() === 'true';
                    }
                }
            }
        }
        
        return '_';
        
    } catch (error) {
        return '_';
    }
}

// Import agreement system
const agreementModule = require('./lib/agreements');

// Check and setup function
async function checkAndSetup() {
    try {
        console.clear();
        
        // Check config first
        const configStatus = checkConfigForAllowUpdates();
        
        // If config has a boolean value (true/false), return it
        if (configStatus === true || configStatus === false) {
            console.log('\x1b[36m✅ Using saved auto-update setting\x1b[0m');
            console.log(`\x1b[36mAuto-updates: ${configStatus ? 'ENABLED' : 'DISABLED'}\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return configStatus;
        }
        
        // If config has '_' or doesn't exist, show agreement
        console.log('\x1b[36mFirst time setup - Agreement required\x1b[0m');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Show bot banner
        console.clear();
        await agreementModule.displayBotBanner("CYPHERS-V2 SETUP", true);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get user agreement
        const autoUpdateEnabled = await agreementModule.getUserAgreement();
        
        // Save setting to config
        await saveAllowUpdatesToConfig(autoUpdateEnabled);
        
        // Clear screen and show success
        console.clear();
        console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
        console.log('\x1b[32m│        ✅ AGREEMENT ACCEPTED                           │\x1b[0m');
        console.log(`\x1b[32m│        Auto-updates: ${autoUpdateEnabled ? 'ENABLED' : 'DISABLED'}                   │\x1b[0m`);
        console.log('\x1b[32m│        Starting CYPHERS-v2...                         │\x1b[0m');
        console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return autoUpdateEnabled;
        
    } catch (error) {
        console.log('\x1b[31m❌ Agreement setup failed\x1b[0m');
        return true; // Default to enabled
    }
}

// Function to save allowUpdates to config.js
async function saveAllowUpdatesToConfig(allowUpdates) {
    try {
        const configPath = path.join(__dirname, './settings/config.js');
        let configContent = '';
        
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }
        
        // Check if global.allowUpdates already exists
        if (configContent.includes('global.allowUpdates')) {
            configContent = configContent.replace(
                /global\.allowUpdates\s*=\s*.*?;/,
                `global.allowUpdates = ${allowUpdates};`
            );
        } else {
            // Add at the beginning
            configContent = `global.allowUpdates = ${allowUpdates};\n${configContent}`;
        }
        
        fs.writeFileSync(configPath, configContent, 'utf8');
        
    } catch (error) {
        console.log(`\x1b[33m⚠️ Could not save to config\x1b[0m`);
    }
}

// Check if update was just applied
function checkForRecentUpdate() {
    try {
        const updateFlagFile = path.join(__dirname, '.update_pending.flag');
        if (fs.existsSync(updateFlagFile)) {
            const updateTime = parseInt(fs.readFileSync(updateFlagFile, 'utf8'));
            const now = Date.now();
            
            // If update happened less than 10 seconds ago
            if (now - updateTime < 10000) {
                fs.unlinkSync(updateFlagFile);
                return true;
            }
            fs.unlinkSync(updateFlagFile);
        }
    } catch (error) {
        // Silent error
    }
    return false;
}

// Main bot start function
async function startBot() {
    // Check if this is a restart after auto-update
    const justUpdated = checkForRecentUpdate();
    if (justUpdated) {
        console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
        console.log('\x1b[32m│        ✅ UPDATE APPLIED SUCCESSFULLY                  │\x1b[0m');
        console.log('\x1b[32m│        Running latest version now ⚡                   │\x1b[0m');
        console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Check agreement/config
    const autoUpdateEnabled = await checkAndSetup();
    
    // Now load config
    const configPath = require.resolve('./settings/config');
    delete require.cache[configPath];
    require('./settings/config');
    
    // Ensure global.allowUpdates exists
    global.allowUpdates = autoUpdateEnabled;
    
    // Load AutoUpdater if enabled
    let AutoUpdater = null;
    let autoUpdater = null;
    
    if (global.allowUpdates) {
        try {
            AutoUpdater = require('./deadline');
            console.log('\x1b[36m✅ Auto-updater enabled\x1b[0m');
        } catch (error) {
            console.log('\x1b[33m⚠️ Auto-updater module not found\x1b[0m');
            global.allowUpdates = false;
        }
    } else {
        console.log('\x1b[33m⚠️ Auto-updates disabled by user choice\x1b[0m');
    }

    const { 
        default: makeWASocket, 
        useMultiFileAuthState, 
        DisconnectReason,
        makeCacheableSignalKeyStore,
        Browsers,
        fetchLatestBaileysVersion
    } = require("@whiskeysockets/baileys");

    const pino = require('pino');
    const readline = require("readline");
    const { Boom } = require('@hapi/boom');
    const { color } = require('./lib/color');
    const { smsg } = require('./lib/myfunction');

    const usePairingCode = true;
    const question = (text) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((resolve) => { rl.question(text, resolve) });
    }

    // Global variables
    let plugins = {};
    let cyphersInstance = null;
    let botRestarting = false;

    // Function to load plugins
    function loadPlugins() {
        const pluginsDir = path.join(__dirname, 'plugins');
        
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
            return;
        }
        
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => 
            file.endsWith('.js') || file.endsWith('.cjs')
        );
        
        plugins = {};
        
        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                const plugin = require(pluginPath);
                
                if (plugin.name && plugin.execute) {
                    plugins[plugin.name] = plugin;
                }
            } catch (error) {
                // Silent error
            }
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
            version: (await fetchLatestBaileysVersion()).version,
            browser: Browsers.ubuntu('Chrome'),
            logger: pino({ level: 'silent' }),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            }
        });

        cyphersInstance = cyphers;
        
        // Set bot mode from config
        cyphers.public = global.status !== undefined ? global.status : true;

        if (usePairingCode && !cyphers.authState.creds.registered) {
            const phoneNumber = await question('Enter bot phone number (e.g., 233xxx): ');
            const code = await cyphers.requestPairingCode(phoneNumber, "CYPHERS");
            console.log(`\x1b[1;33mPairing Code: ${code}\x1b[0m`);
        }

        // Initialize AutoUpdater if enabled
        if (global.allowUpdates && AutoUpdater) {
            if (!autoUpdater) {
                autoUpdater = new AutoUpdater(cyphers);
                
                // Set update complete handler
                autoUpdater.onUpdateComplete = async (changes, commitHash) => {
                    const updatedFiles = changes.filter(c => c.type === 'UPDATED' || c.type === 'NEW').length;
                    console.log(`\x1b[32m✅ ${updatedFiles} files updated\x1b[0m`);
                    
                    // Hot reload plugins if only plugins were updated
                    const onlyPlugins = changes.every(change => 
                        change.file.includes('plugins/') || change.file.includes('lib/')
                    );
                    
                    if (onlyPlugins) {
                        console.log('\x1b[36m🔄 Hot reloading plugins...\x1b[0m');
                        loadPlugins();
                    }
                };
                
                autoUpdater.start();
                console.log('\x1b[36m✅ Auto-updater monitoring started\x1b[0m');
            } else {
                // Update bot reference
                autoUpdater.bot = cyphers;
            }
        }
        
        // Load plugins
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
                
                const m = smsg(cyphers, mek);
                const messageText = m.body?.toLowerCase() || '';
                const prefix = global.prefix || '.';
                
                if (messageText.startsWith(prefix)) {
                    const args = messageText.slice(prefix.length).trim().split(/ +/);
                    const commandName = args.shift().toLowerCase();
                    
                    const plugin = Object.values(plugins).find(p => 
                        p.name.toLowerCase() === commandName
                    );
                    
                    if (plugin) {
                        try {
                            await plugin.execute(cyphers, m, args);
                        } catch (error) {
                            console.log(color(`Error in ${plugin.name}: ${error.message}`, 'red'));
                        }
                    }
                }
            } catch (err) {
                // Silent error
            }
        });

        cyphers.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                
                if (!lastDisconnect?.error) {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.badSession) {
                    console.log(color('Bad Session, delete session and scan again'));
                    process.exit();
                } else if (reason === DisconnectReason.connectionClosed) {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.connectionLost) {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.connectionReplaced) {
                    cyphers.logout();
                    botRestarting = false;
                    setTimeout(cyphersStart, 5000);
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log(color('Logged out, scan again'));
                    cyphers.logout();
                } else if (reason === DisconnectReason.restartRequired) {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else if (reason === DisconnectReason.timedOut) {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                } else {
                    botRestarting = false;
                    setTimeout(cyphersStart, 2000);
                }
            } else if (connection === "connecting") {
                console.clear();
                console.log(color('Connecting...', 'cyan'));
            } else if (connection === "open") {
                console.clear();
                
                // Show bot info
                const versionInfo = getVersionFromFile();
                
                console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
                console.log('\x1b[32m│             ' + versionInfo + '                     │\x1b[0m');
                console.log(`\x1b[32m│     📦 ${Object.keys(plugins).length} plugins loaded                        │\x1b[0m`);
                console.log(`\x1b[32m│     ⚡  Bot: ${cyphers.public ? 'Public' : 'Private'} mode                          │\x1b[0m`);
                console.log(`\x1b[32m│     🔄 Auto-updates: ${global.allowUpdates ? 'Enabled' : 'Disabled'}                     │\x1b[0m`);
                console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
                
                botRestarting = false;
            }
        });

        cyphers.ev.on('creds.update', saveCreds);
        
        return cyphers;
    }

    // Function to read version from file
    function getVersionFromFile() {
        try {
            const possiblePaths = [
                path.join(__dirname, 'version.txt'),
                path.join(__dirname, 'ver/version.txt'),
                path.join(__dirname, 'vers/version.txt')
            ];
            
            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    return fs.readFileSync(filePath, 'utf8').trim();
                }
            }
            
            return 'CYPHERS-v2';
        } catch (error) {
            return 'CYPHERS-v2';
        }
    }

    // Start the bot
    await cyphersStart();
}

// Start everything
startBot().catch(error => {
    console.error('\x1b[31mFailed to start bot:', error.message, '\x1b[0m');
    process.exit(1);
});
