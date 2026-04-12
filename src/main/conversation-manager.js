/**
 * 会話履歴管理（SQLite）
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const { DB_PATH } = require('../shared/constants');
const fs = require('fs');
const path = require('path');

class ConversationManager {
  constructor() {
    this.db = null;
  }

  initialize() {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._createTables();
    console.log('Conversation DB initialized:', DB_PATH);
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '新しい会話',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    `);
  }

  listConversations() {
    return this.db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      ORDER BY updated_at DESC
    `).all();
  }

  createConversation(title = '新しい会話') {
    const id = uuidv4();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, now, now);
    return { id, title, created_at: now, updated_at: now };
  }

  loadConversation(id) {
    const conversation = this.db.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).get(id);

    if (!conversation) return null;

    const messages = this.db.prepare(`
      SELECT role, content, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `).all(id);

    return { conversation, messages };
  }

  deleteConversation(id) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  saveMessage(conversationId, role, content) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO messages (conversation_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, role, content, now);

    this.db.prepare(
      'UPDATE conversations SET updated_at = ? WHERE id = ?'
    ).run(now, conversationId);
  }

  updateTitle(id, title) {
    this.db.prepare(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
    ).run(title, Date.now(), id);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = ConversationManager;
