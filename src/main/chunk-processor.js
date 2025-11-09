/**
 * チャンク分割処理
 * テキストを512トークン単位で分割（128トークンオーバーラップ）
 */

const { encode } = require('gpt-tokenizer');

class ChunkProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 512;
    this.overlap = options.overlap || 128;
  }

  /**
   * テキストをチャンクに分割
   * @param {string} text - 分割するテキスト
   * @returns {Array<object>} チャンク配列 [{content, tokenCount, index}]
   */
  splitIntoChunks(text) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // テキスト全体をトークン化
    const tokens = encode(text);

    // チャンク配列
    const chunks = [];
    let index = 0;

    // スライディングウィンドウでチャンク分割
    for (let i = 0; i < tokens.length; i += (this.chunkSize - this.overlap)) {
      const chunkTokens = tokens.slice(i, i + this.chunkSize);

      // トークンからテキストを復元（簡易的に元テキストから切り出し）
      const startPos = this.findTextPosition(text, tokens, i);
      const endPos = this.findTextPosition(text, tokens, i + chunkTokens.length);
      const content = text.substring(startPos, endPos).trim();

      if (content.length > 0) {
        chunks.push({
          content,
          tokenCount: chunkTokens.length,
          index: index++,
        });
      }

      // 最後のチャンクに到達したら終了
      if (i + this.chunkSize >= tokens.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * トークン位置から元テキストの位置を推定
   * @private
   */
  findTextPosition(text, allTokens, tokenIndex) {
    // 簡易実装: トークン数に比例して位置を推定
    const ratio = tokenIndex / allTokens.length;
    return Math.floor(text.length * ratio);
  }

  /**
   * テキストのトークン数をカウント
   * @param {string} text - カウントするテキスト
   * @returns {number} トークン数
   */
  countTokens(text) {
    if (!text) return 0;
    return encode(text).length;
  }

  /**
   * チャンク統計情報を取得
   * @param {Array<object>} chunks - チャンク配列
   * @returns {object} 統計情報
   */
  getChunkStats(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        count: 0,
        totalTokens: 0,
        avgTokens: 0,
        minTokens: 0,
        maxTokens: 0,
      };
    }

    const tokenCounts = chunks.map(c => c.tokenCount);
    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

    return {
      count: chunks.length,
      totalTokens,
      avgTokens: Math.round(totalTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
    };
  }
}

module.exports = ChunkProcessor;
