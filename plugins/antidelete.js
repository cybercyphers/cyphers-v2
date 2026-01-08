// plugins/antidelete.js
const { handleAntideleteCommand } = require('../lib/antidelete');

module.exports = {
    name: 'antidelete',
    description: 'Enable/disable anti-delete feature',
    async execute(sock, msg, args) {
        await handleAntideleteCommand(sock, msg.key.remoteJid, msg, args.join(' '));
    }
};
