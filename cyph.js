console.clear();
const fs = require('fs');
const path = require('path');
const readline = require("readline");

// ==================== SIMPLE AGREEMENT SYSTEM ====================
async function checkAndSetup() {
    console.clear();
    
    // Check if config exists and has allowUpdates setting
    try {
        const configPath = path.join(__dirname, './settings/config.js');
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            
            // Simple check for allowUpdates
            if (configContent.includes('global.allowUpdates = true')) {
                console.log('\x1b[32m✅ Auto-updates: ENABLED\x1b[0m');
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }
            if (configContent.includes('global.allowUpdates = false')) {
                console.log('\x1b[33m⚠️  Auto-updates: DISABLED\x1b[0m');
                await new Promise(resolve => setTimeout(resolve, 1000));
                return false;
            }
        }
    } catch (error) {
        // Continue to ask user
    }
    
    // Ask user for permission
    console.log('\x1b[36m┌──────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[36m│              AUTO-UPDATE SETTINGS                        │\x1b[0m');
    console.log('\x1b[36m│                                                          │\x1b[0m');
    console.log('\x1b[36m│  This bot can update itself automatically.              │\x1b[0m');
    console.log('\x1b[36m│  Do you want to enable auto-updates? (y/n)              │\x1b[0m');
    console.log('\x1b[36m└──────────────────────────────────────────────────────────┘\x1b[0m');
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
        rl.question('\x1b[33mChoice (y/n): \x1b[0m', resolve);
    });
    rl.close();
    
    const enabled = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    
    // Save to config
    try {
        const configPath = path.join(__dirname, './settings/config.js');
        let configContent = '';
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }
        
        // Remove existing allowUpdates line if present
        configContent = configContent.replace(/global\.allowUpdates\s*=\s*.*?;/g, '');
        
        // Add new setting at the end
        if (!configContent.includes('global.allowUpdates')) {
            configContent += `\nglobal.allowUpdates = ${enabled};`;
        }
        
        fs.writeFileSync(configPath, configContent, 'utf8');
    } catch (error) {
        console.log('\x1b[33m⚠️  Could not save setting\x1b[0m');
    }
    
    console.clear();
    console.log(`\x1b[32m✅ Auto-updates: ${enabled ? 'ENABLED' : 'DISABLED'}\x1b[0m`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return enabled;
}

// ==================== CLEANUP OLD TEMP FILES ====================
function cleanupTempFiles() {
    try {
        const files = fs.readdirSync(__dirname);
        files.forEach(file => {
            if (file.startsWith('update_temp_') || file.startsWith('.update_temp_')) {
                try {
                    const filePath = path.join(__dirname, file);
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    }
                } catch {}
            }
        });
    } catch {}
}

// ==================== MAIN BOT START ====================
async function startBot() {
    // Cleanup old temp files first
    cleanupTempFiles();
    
    // Ask user for update permission
    const autoUpdateEnabled = await checkAndSetup();
    
    // Load config
    require('./settings/config');
    
    // Set global setting
    global.allowUpdates = autoUpdateEnabled;
    
    // Show status
    console.clear();
    console.log('Starting bot...\n');
    
    // Load dependencies
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

    // Setup fetch
    if (typeof globalThis.fetch !== 'function') {
        globalThis.fetch = require('node-fetch');
    }

    const usePairingCode = true;
    const question = (text) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((resolve) => { rl.question(text, resolve) });
    }

    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    // Global variables
    let plugins = {};
    let loadedPlugins = new Set();
    let autoUpdater = null;
    let cyphersInstance = null;
    let botRestarting = false;

    // Check if restart after update
    if (process.env.CYPHERS_AUTO_UPDATED === 'true') {
        console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
        console.log('\x1b[32m│        ✅ UPDATED SUCCESSFULLY                         │\x1b[0m');
        console.log('\x1b[32m│        Running latest version now ⚡                   │\x1b[0m');
        console.log('\x1b[32m└──────────────────────────────────────────────────────────┘\x1b[0m');
        delete process.env.CYPHERS_AUTO_UPDATED;
    }

    // Load plugins
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
        loadedPlugins.clear();
        
        for (const file of pluginFiles) {
            try {
                const plugin = require(path.join(pluginsDir, file));
                
                if (plugin.name && plugin.execute) {
                    plugins[plugin.name] = plugin;
                    loadedPlugins.add(plugin.name);
                }
            } catch {}
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
            const phoneNumber = await question('Enter bot phone number: ');
            const code = await cyphers.requestPairingCode(phoneNumber, "CYPHERSS");
            console.log(`\x1b[1;33mPairing Code: ${code}\x1b[0m`);
        }

        store.bind(cyphers.ev);
        
        // ==================== SIMPLE AUTO-UPDATE CHECK ====================
        if (global.allowUpdates) {
            console.log('\x1b[36m✅ Auto-updates enabled\x1b[0m');
            
            // Simple update check - you can expand this
            setTimeout(async () => {
                try {
                    const versionFile = path.join(__dirname, 'version.txt');
                    if (fs.existsSync(versionFile)) {
                        const currentVersion = fs.readFileSync(versionFile, 'utf8').trim();
                        console.log(`\x1b[36mCurrent version: ${currentVersion}\x1b[0m`);
                    }
                } catch {}
            }, 5000);
        } else {
            console.log('\x1b[33m⚠️  Auto-updates disabled\x1b[0m');
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
                            await plugin.execute(cyphers, m, args);
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
                
                console.log('\x1b[32m┌──────────────────────────────────────────────────────────┐\x1b[0m');
                console.log('\x1b[32m│             ✅ CYPHERS-v2 ACTIVE                        │\x1b[0m');
                console.log(`\x1b[32m│     📦 ${Object.keys(plugins).length} plugins loaded                        │\x1b[0m`);
                console.log('\x1b[32m│     ⚡  Live updates by cybercyphers                          │\x1b[0m');
                console.log(`\x1b[32m│     🔄 Auto-updates: ${global.allowUpdates ? 'Enabled ✅' : 'Disabled ❌'}                     │\x1b[0m`);
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
