/**
 * データベース管理クラス
 * RAG用SQLite FTS5（BM25全文検索）
 */

const Database = require('better-sqlite3');
const { RAG_DB_PATH } = require('../shared/constants');
const fs = require('fs');
const path = require('path');

class DBManager {
  constructor() {
    this.db = null;
  }

  /**
   * データベース初期化
   */
  initialize() {
    try {
      // データベースディレクトリ作成
      const dbDir = path.dirname(RAG_DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // データベース接続
      this.db = new Database(RAG_DB_PATH);
      this.db.pragma('journal_mode = WAL');

      // スキーマ作成
      this.createTables();

      console.log('RAG Database initialized:', RAG_DB_PATH);
    } catch (error) {
      console.error('Failed to initialize RAG database:', error);
      throw error;
    }
  }

  /**
   * テーブル作成
   */
  createTables() {
    // ウェブページ管理テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS web_pages (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        indexed_at INTEGER NOT NULL,
        chunk_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'indexed', 'error'))
      );
    `);

    // FTS5全文検索テーブル（BM25対応）
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        page_id UNINDEXED,
        content,
        chunk_index UNINDEXED,
        tokenize='porter ascii'
      );
    `);

    // チャンクメタデータテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        token_count INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES web_pages(id) ON DELETE CASCADE
      );
    `);

    // インデックス作成
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks_meta(page_id);
    `);

    console.log('Database tables created');
  }

  /**
   * URLを追加
   * @param {string} id - ページID
   * @param {string} url - URL
   * @returns {object} 追加したページ情報
   */
  addUrl(id, url) {
    const stmt = this.db.prepare(`
      INSERT INTO web_pages (id, url, indexed_at, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const now = Date.now();
    stmt.run(id, url, now);

    return { id, url, status: 'pending', indexedAt: now, chunkCount: 0 };
  }

  /**
   * URLを削除（カスケード削除でチャンクも削除）
   * @param {string} id - ページID
   */
  removeUrl(id) {
    // チャンクを削除（FTS5から）
    const deleteChunks = this.db.prepare(`
      DELETE FROM chunks_fts WHERE page_id = ?
    `);
    deleteChunks.run(id);

    // ページを削除（chunks_metaはFOREIGN KEYでカスケード削除）
    const deletePage = this.db.prepare(`
      DELETE FROM web_pages WHERE id = ?
    `);
    deletePage.run(id);
  }

  /**
   * URL一覧を取得
   * @returns {Array} ページ一覧
   */
  listUrls() {
    const stmt = this.db.prepare(`
      SELECT id, url, title, indexed_at as indexedAt, chunk_count as chunkCount, status
      FROM web_pages
      ORDER BY indexed_at DESC
    `);

    return stmt.all();
  }

  /**
   * ページ情報を更新
   * @param {string} id - ページID
   * @param {object} updates - 更新データ
   */
  updatePage(id, updates) {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.chunkCount !== undefined) {
      fields.push('chunk_count = ?');
      values.push(updates.chunkCount);
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE web_pages SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  /**
   * チャンクを保存
   * @param {string} pageId - ページID
   * @param {Array<object>} chunks - チャンク配列 [{content, tokenCount, index}]
   */
  saveChunks(pageId, chunks) {
    const insertFts = this.db.prepare(`
      INSERT INTO chunks_fts (page_id, content, chunk_index)
      VALUES (?, ?, ?)
    `);

    const insertMeta = this.db.prepare(`
      INSERT INTO chunks_meta (page_id, chunk_index, token_count, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const now = Date.now();

    // トランザクション実行
    const insertMany = this.db.transaction((chunks) => {
      for (const chunk of chunks) {
        insertFts.run(pageId, chunk.content, chunk.index);
        insertMeta.run(pageId, chunk.index, chunk.tokenCount, now);
      }
    });

    insertMany(chunks);

    // ページのチャンク数を更新
    this.updatePage(pageId, { chunkCount: chunks.length, status: 'indexed' });
  }

  /**
   * BM25検索
   * @param {string} query - 検索クエリ
   * @param {number} limit - 最大件数（デフォルト3）
   * @returns {Array} 検索結果 [{pageId, url, title, content, score, chunkIndex}]
   */
  search(query, limit = 3) {
    const stmt = this.db.prepare(`
      SELECT
        chunks_fts.page_id as pageId,
        p.url,
        p.title,
        chunks_fts.content,
        chunks_fts.chunk_index as chunkIndex,
        bm25(chunks_fts) as score
      FROM chunks_fts
      JOIN web_pages p ON chunks_fts.page_id = p.id
      WHERE chunks_fts MATCH ?
      ORDER BY bm25(chunks_fts)
      LIMIT ?
    `);

    return stmt.all(query, limit);
  }

  /**
   * RAG統計情報を取得
   * @returns {object} 統計情報
   */
  getStats() {
    const pageCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM web_pages WHERE status = 'indexed'
    `).get();

    const chunkCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM chunks_meta
    `).get();

    return {
      indexedPages: pageCount.count,
      totalChunks: chunkCount.count,
    };
  }

  /**
   * データベースを閉じる
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = DBManager;
