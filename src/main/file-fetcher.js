/**
 * ローカルファイルフェッチャー
 * ローカルファイルを読み込んでクリーンなテキストに変換
 * Phase 1: TXT/MD対応
 */

const fs = require('fs');
const path = require('path');

class FileFetcher {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB制限
    this.supportedExtensions = ['.txt', '.md', '.markdown', '.pdf'];
  }

  /**
   * ファイルを読み込む
   * @param {string} filePath - 読み込むファイルパス
   * @returns {Promise<string>} ファイル内容
   */
  async readFile(filePath) {
    return new Promise((resolve, reject) => {
      // ファイル存在チェック
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      // ファイルサイズチェック
      const stats = fs.statSync(filePath);
      if (stats.size > this.maxFileSize) {
        reject(new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${this.maxFileSize / 1024 / 1024}MB)`));
        return;
      }

      // ファイル読み込み
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          reject(new Error(`Failed to read file: ${err.message}`));
          return;
        }
        resolve(data);
      });
    });
  }

  /**
   * テキストをクリーンアップ
   * @param {string} content - ファイル内容
   * @param {string} fileType - ファイル拡張子
   * @returns {object} {title, text}
   */
  extractText(content, fileType) {
    let title = 'Untitled';
    let text = content;

    // マークダウンの場合、最初のH1をタイトルとして抽出
    if (fileType === '.md' || fileType === '.markdown') {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    }

    // テキストのクリーンアップ
    text = text
      .replace(/\r\n/g, '\n') // Windows改行を統一
      .replace(/\s+$/gm, '') // 行末の空白削除
      .replace(/\n{3,}/g, '\n\n') // 連続する空行を2つまでに制限
      .trim();

    return { title, text };
  }

  /**
   * ファイルパスからファイル名を取得（タイトルとして使用）
   * @param {string} filePath - ファイルパス
   * @returns {string} ファイル名（拡張子なし）
   */
  getFileName(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    return fileName;
  }

  /**
   * ファイルを読み込んでテキスト化
   * @param {string} filePath - 読み込むファイルパス
   * @returns {Promise<object>} {title, text, fileName, filePath}
   */
  async fetchAndExtract(filePath) {
    try {
      const fileType = path.extname(filePath).toLowerCase();

      // PDFは専用パスで処理
      if (fileType === '.pdf') {
        return await this._extractPdf(filePath);
      }

      const content = await this.readFile(filePath);
      const result = this.extractText(content, fileType);

      // タイトルがデフォルトの場合、ファイル名を使用
      if (result.title === 'Untitled') {
        result.title = this.getFileName(filePath);
      }

      // メタデータ追加
      result.fileName = path.basename(filePath);
      result.filePath = filePath;

      return result;
    } catch (error) {
      throw new Error(`Failed to process file ${filePath}: ${error.message}`);
    }
  }

  /**
   * PDFを読み込んでテキスト抽出
   * @param {string} filePath - PDFファイルパス
   * @returns {Promise<object>} {title, text, fileName, filePath}
   */
  async _extractPdf(filePath) {
    // ファイルサイズチェック
    const stats = fs.statSync(filePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${this.maxFileSize / 1024 / 1024}MB)`);
    }

    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const rawText = data.text || '';

    // テキストのクリーンアップ
    const text = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // タイトル: PDFメタデータのタイトルを優先、なければファイル名
    const metaTitle = data.info && data.info.Title ? data.info.Title.trim() : '';
    const title = metaTitle || this.getFileName(filePath);

    return {
      title,
      text,
      fileName: path.basename(filePath),
      filePath,
      pages: data.numpages,
    };
  }

  /**
   * ファイルの妥当性をチェック
   * @param {string} filePath - チェックするファイルパス
   * @returns {boolean} 妥当性
   */
  isValidFile(filePath) {
    try {
      // ファイル存在チェック
      if (!fs.existsSync(filePath)) {
        return false;
      }

      // ディレクトリでないことを確認
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return false;
      }

      // 対応拡張子チェック
      const ext = path.extname(filePath).toLowerCase();
      return this.supportedExtensions.includes(ext);
    } catch {
      return false;
    }
  }

  /**
   * 対応ファイル形式の一覧を取得
   * @returns {string[]} 対応拡張子リスト
   */
  getSupportedExtensions() {
    return [...this.supportedExtensions];
  }
}

module.exports = FileFetcher;
