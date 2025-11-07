/**
 * モデルファイル管理
 * GGUFファイルの検索、追加、削除を管理
 */

const fs = require('fs').promises;
const path = require('path');
const { MODELS_DIR } = require('../shared/constants');

class ModelManager {
  constructor() {
    this.modelsDir = MODELS_DIR;
  }

  /**
   * モデルディレクトリを初期化
   */
  async initialize() {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
      console.log('Models directory initialized:', this.modelsDir);
    } catch (error) {
      console.error('Failed to initialize models directory:', error);
      throw error;
    }
  }

  /**
   * 利用可能なモデル一覧を取得
   * @returns {Array} モデル情報の配列
   */
  async listModels() {
    try {
      const files = await fs.readdir(this.modelsDir);
      const models = [];

      for (const file of files) {
        if (file.endsWith('.gguf')) {
          const filePath = path.join(this.modelsDir, file);
          const stats = await fs.stat(filePath);

          models.push({
            id: file,
            name: file.replace('.gguf', ''),
            path: filePath,
            size: stats.size,
            sizeFormatted: this.formatBytes(stats.size),
            createdAt: stats.birthtime,
          });
        }
      }

      // 名前順でソート
      models.sort((a, b) => a.name.localeCompare(b.name));

      return models;
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * モデルを追加（ファイルをコピー）
   * @param {string} sourcePath - 元のファイルパス
   * @returns {Object} 追加されたモデル情報
   */
  async addModel(sourcePath) {
    try {
      const fileName = path.basename(sourcePath);

      // .ggufファイルかチェック
      if (!fileName.endsWith('.gguf')) {
        throw new Error('Invalid file type. Only .gguf files are supported.');
      }

      const destPath = path.join(this.modelsDir, fileName);

      // 既に存在するかチェック
      try {
        await fs.access(destPath);
        throw new Error('Model already exists');
      } catch (err) {
        // ファイルが存在しない場合は続行
        if (err.code !== 'ENOENT') throw err;
      }

      // ファイルをコピー
      await fs.copyFile(sourcePath, destPath);

      const stats = await fs.stat(destPath);

      return {
        id: fileName,
        name: fileName.replace('.gguf', ''),
        path: destPath,
        size: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        createdAt: stats.birthtime,
      };
    } catch (error) {
      console.error('Failed to add model:', error);
      throw error;
    }
  }

  /**
   * モデルを削除
   * @param {string} modelId - モデルID（ファイル名）
   */
  async deleteModel(modelId) {
    try {
      const modelPath = path.join(this.modelsDir, modelId);
      await fs.unlink(modelPath);
      console.log('Model deleted:', modelId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw error;
    }
  }

  /**
   * モデルが存在するかチェック
   * @param {string} modelId - モデルID
   * @returns {boolean}
   */
  async modelExists(modelId) {
    try {
      const modelPath = path.join(this.modelsDir, modelId);
      await fs.access(modelPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * バイト数を人間が読みやすい形式に変換
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = ModelManager;
