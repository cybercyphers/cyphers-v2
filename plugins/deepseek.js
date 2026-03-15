// plugins/deepseek.js
const axios = require("axios");
const db = require("../database/db");
const cron = require("node-cron");

module.exports = {
    name: 'deepseek',
    description: 'AI chat using Deepseek model',
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;

        try {
            const query = args.join(' ').trim();

            if (!query) {
                await sock.sendMessage(from, { text: '☢️ Please provide a question.' }, { quoted: msg });
                return;
            }

            // React with 🤖 while processing
            await sock.sendMessage(from, { react: { text: "🤖", key: msg.key } });

            const apiUrl = `https://all-in-1-ais.officialhectormanuel.workers.dev/?query=${encodeURIComponent(query)}&model=deepseek`;

            const response = await axios.get(apiUrl);

            if (response.data && response.data.success && response.data.message?.content) {
                const answer = response.data.message.content;

                // Save to DB
                db.run(
                    "INSERT INTO chat_history (user_id, question, answer) VALUES (?, ?, ?)",
                    [from, query, answer]
                );

                await sock.sendMessage(from, { text: answer }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: '☢️ AI returned no answer.' }, { quoted: msg });
            }
        } catch (error) {
            console.error("Deepseek API Error:", error.message);
            await sock.sendMessage(from, { text: '☢️ Something went wrong.' }, { quoted: msg });
        }
    }
};

// Cron job: clear old entries every hour
cron.schedule("0 * * * *", () => {
    db.run("DELETE FROM chat_history WHERE created_at <= datetime('now', '-1 day')");
    console.log("Old chat history cleared");
});
