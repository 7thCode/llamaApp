/**
 * RAG統合マネージャー
 * ウェブページのインデックス化と検索を管理
 */

const { v4: uuidv4 } = require('uuid');
const DBManager = require('./db-manager');
const WebFetcher = require('./web-fetcher');
const ChunkProcessor = require('./chunk-processor');

class RagManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.db = new DBManager();
    this.fetcher = new WebFetcher();
    this.processor = new ChunkProcessor();
    this.ragEnabled = false;
  }

  /**
   * 初期化
   */
  initialize() {
    this.db.initialize();
    console.log('RAG Manager initialized');
  }

  /**
   * URLを追加
   * @param {string} url - 追加するURL
   * @returns {object} ページ情報
   */
  addUrl(url) {
    // URL妥当性チェック
    if (!this.fetcher.isValidUrl(url)) {
      throw new Error('Invalid URL format');
    }

    // 重複チェック
    const existing = this.db.listUrls().find(page => page.url === url);
    if (existing) {
      throw new Error('URL already exists');
    }

    const id = uuidv4();
    return this.db.addUrl(id, url);
  }

  /**
   * URLを削除
   * @param {string} id - ページID
   */
  removeUrl(id) {
    this.db.removeUrl(id);
  }

  /**
   * URL一覧を取得
   * @returns {Array} ページ一覧
   */
  listUrls() {
    return this.db.listUrls();
  }

  /**
   * URLをインデックス化
   * @param {string} id - ページID
   */
  async indexUrl(id) {
    try {
      // ページ情報取得
      const pages = this.db.listUrls();
      const page = pages.find(p => p.id === id);

      if (!page) {
        throw new Error('Page not found');
      }

      // プログレス通知
      this.sendProgress(id, 0, 'fetching');

      // ウェブページ取得
      const { title, text } = await this.fetcher.fetchAndExtract(page.url);

      // プログレス通知
      this.sendProgress(id, 30, 'chunking');

      // チャンク分割
      const chunks = this.processor.splitIntoChunks(text);

      if (chunks.length === 0) {
        throw new Error('No content found in page');
      }

      // プログレス通知
      this.sendProgress(id, 60, 'indexing');

      // データベースに保存
      this.db.updatePage(id, { title });
      this.db.saveChunks(id, chunks);

      // プログレス通知
      this.sendProgress(id, 100, 'completed');

      // 完了通知
      const { IPC_CHANNELS } = require('../shared/constants');
      this.mainWindow.webContents.send(IPC_CHANNELS.RAG_INDEX_COMPLETE, {
        pageId: id,
        chunkCount: chunks.length,
        title,
      });

      console.log(`Indexed ${page.url}: ${chunks.length} chunks`);
      return { success: true, chunkCount: chunks.length };
    } catch (error) {
      console.error(`Failed to index ${id}:`, error);

      // エラー状態を更新
      this.db.updatePage(id, { status: 'error' });

      // エラー通知
      const { IPC_CHANNELS } = require('../shared/constants');
      this.mainWindow.webContents.send(IPC_CHANNELS.RAG_INDEX_ERROR, {
        pageId: id,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * プログレス通知を送信
   * @private
   */
  sendProgress(pageId, progress, status) {
    const { IPC_CHANNELS } = require('../shared/constants');
    this.mainWindow.webContents.send(IPC_CHANNELS.RAG_INDEX_PROGRESS, {
      pageId,
      progress,
      status,
    });
  }

  /**
   * 検索実行
   * @param {string} query - 検索クエリ
   * @param {number} limit - 最大件数
   * @returns {Array} 検索結果
   */
  search(query, limit = 3) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    return this.db.search(query, limit);
  }

  /**
   * RAG有効/無効を切り替え
   * @param {boolean} enabled - 有効フラグ
   */
  toggleRag(enabled) {
    this.ragEnabled = enabled;
  }

  /**
   * RAG状態を取得
   * @returns {object} 状態情報
   */
  getStatus() {
    const stats = this.db.getStats();
    return {
      enabled: this.ragEnabled,
      indexedPages: stats.indexedPages,
      totalChunks: stats.totalChunks,
    };
  }

  /**
   * RAGコンテキストを生成
   * @param {string} query - ユーザークエリ
   * @param {string} originalPrompt - 元のプロンプト
   * @returns {string} RAG拡張プロンプト
   */
  async augmentPrompt(query, originalPrompt) {
    if (!this.ragEnabled) {
      return originalPrompt;
    }

    // 検索実行
    const results = this.search(query, 3);

    if (results.length === 0) {
      return originalPrompt;
    }

    // コンテキスト構築
    const context = results.map((result, index) => {
      return `[Source ${index + 1}: ${result.title || result.url}]\n${result.content}`;
    }).join('\n\n');

    // RAG拡張プロンプト生成
    const ragPrompt = `Context from indexed web pages:
${context}

User question: ${originalPrompt}

Please answer the question using the provided context when relevant.`;

    return ragPrompt;
  }

  /**
   * クリーンアップ
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = RagManager;
