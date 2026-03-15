// database/db.js
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database/ai_chat.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      question TEXT,
      answer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;
