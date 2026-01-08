const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Function to get folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // Convert bytes to MB
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

// Function to clean temp folder if size exceeds 100MB
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        
        if (sizeMB > 100) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

// Start periodic cleanup check every 1 minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// Save config
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

// Safe JID decoder to prevent errors
function safeDecodeJid(jid) {
    if (!jid) return { user: null, server: null };
    
    try {
        const parts = jid.split('@');
        if (parts.length === 2) {
            return {
                user: parts[0],
                server: parts[1]
            };
        }
        
        // Try to extract from typical WhatsApp JID formats
        if (jid.includes(':')) {
            const [user, server] = jid.split(':');
            return {
                user: user,
                server: server ? server.split('@')[1] : null
            };
        }
        
        return { user: null, server: null };
    } catch (error) {
        console.error('JID decode error:', error);
        return { user: null, server: null };
    }
}

// Store incoming messages
async function storeMessage(message, sock) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';

        const sender = message.key.participant || message.key.remoteJid;

        // Detect content
        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await writeFile(mediaPath, buffer);
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        
        // Get bot owner number safely
        let ownerNumber = sock.user.id;
        if (ownerNumber.includes(':')) {
            ownerNumber = ownerNumber.split(':')[0] + '@s.whatsapp.net';
        } else if (!ownerNumber.includes('@')) {
            ownerNumber = ownerNumber + '@s.whatsapp.net';
        }

        // Don't report if bot deleted the message
        if (deletedBy.includes(sock.user.id.split(':')[0]) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderDecoded = safeDecodeJid(sender);
        const deletedByDecoded = safeDecodeJid(deletedBy);
        
        const senderName = senderDecoded.user || sender.split('@')[0] || 'Unknown';
        const deletedByName = deletedByDecoded.user || deletedBy.split('@')[0] || 'Unknown';
        
        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* ${deletedByName}\n` +
            `*👤 Sender:* ${senderName}\n` +
            `*📱 Sender JID:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (original.group) {
            try {
                const groupMetadata = await sock.groupMetadata(original.group);
                text += `*👥 Group:* ${groupMetadata.subject || 'Unknown Group'}\n`;
            } catch (err) {
                text += `*👥 Group:* ${original.group}\n`;
            }
        }

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        await sock.sendMessage(ownerNumber, {
            text,
            mentions: []
        });

        // Media sending
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*Deleted ${original.mediaType}*\nFrom: ${senderName}`,
                mentions: []
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerNumber, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerNumber, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerNumber, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }

            // Cleanup
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('Media cleanup error:', err);
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

// Plugin structure for your bot
module.exports = {
    name: 'antidelete',
    description: 'Anti-delete feature to track deleted messages',
    category: 'utility',
    ownerOnly: true,
    
    async execute(bot, m, args) {
        try {
            const config = loadAntideleteConfig();
            
            if (!args[0]) {
                // Show status
                await bot.sendMessage(m.chat, {
                    text: `*ANTIDELETE SETUP*\n\n` +
                          `*Current Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                          `*Usage:*\n` +
                          `• antidelete on - Enable\n` +
                          `• antidelete off - Disable\n\n` +
                          `*Note:* Only bot owner can use this command.`
                }, { quoted: m });
                return;
            }
            
            const action = args[0].toLowerCase();
            
            if (action === 'on') {
                config.enabled = true;
                saveAntideleteConfig(config);
                await bot.sendMessage(m.chat, {
                    text: '✅ *Anti-delete enabled*\n\nNow tracking all deleted messages and media. Reports will be sent to bot owner.'
                }, { quoted: m });
            } 
            else if (action === 'off') {
                config.enabled = false;
                saveAntideleteConfig(config);
                await bot.sendMessage(m.chat, {
                    text: '❌ *Anti-delete disabled*'
                }, { quoted: m });
            }
            else {
                await bot.sendMessage(m.chat, {
                    text: '⚠️ *Invalid option*\n\nUse: antidelete on/off'
                }, { quoted: m });
            }
            
        } catch (error) {
            console.error('Anti-delete command error:', error);
            await bot.sendMessage(m.chat, {
                text: `❌ Error: ${error.message}`
            }, { quoted: m });
        }
    },
    
    // This should be called from your main file's message handler
    onMessage: async (bot, message) => {
        await storeMessage(message, bot);
    },
    
    // This should be called from your main file's message deletion handler
    onMessageDelete: async (bot, deletionMessage) => {
        await handleMessageRevocation(bot, deletionMessage);
    }
};
