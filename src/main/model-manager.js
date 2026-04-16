/**
 * モデルファイル管理
 * GGUFファイルの検索、追加、削除を管理
 */

const fs = require('fs').promises;
const path = require('path');
const { MODELS_DIR } = require('../shared/constants');

// Vision モデルを示すファイル名パターン
const VISION_NAME_PATTERNS = [
  /llava/i, /moondream/i, /minicpm[\-_]?v/i, /qwen[\-_]?vl/i,
  /internvl/i, /phi[\-_]?v\b/i, /vision/i, /multimodal/i,
  /cogvlm/i, /idefics/i, /bakllava/i,
];
// mmproj（画像エンコーダ）ファイルを示すパターン
const MMPROJ_NAME_PATTERNS = [/mmproj/i, /\bclip\b/i];

class ModelManager {
  constructor(customModelsDir = null) {
    this.modelsDir = customModelsDir || MODELS_DIR;
  }

  /**
   * モデルディレクトリを変更
   * @param {string} newDir - 新しいモデルディレクトリパス
   */
  setModelsDirectory(newDir) {
    this.modelsDir = newDir;
  }

  /**
   * 現在のモデルディレクトリを取得
   * @returns {string} 現在のモデルディレクトリパス
   */
  getModelsDirectory() {
    return this.modelsDir;
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
        if (!file.endsWith('.gguf')) continue;

        const filePath = path.join(this.modelsDir, file);
        const stats = await fs.stat(filePath);
        const vision = await this.detectVisionCapability(filePath);

        // mmproj ファイル自体はモデル一覧に表示しない
        if (vision.isMmproj) continue;

        models.push({
          id: file,
          name: file.replace('.gguf', ''),
          path: filePath,
          size: stats.size,
          sizeFormatted: this.formatBytes(stats.size),
          createdAt: stats.birthtime,
          isVision: vision.isVision,
          mmprojPath: vision.mmprojPath,
        });
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
   * モデルファイルが Vision 対応かどうか検出
   * @param {string} modelPath
   * @returns {{ isVision: boolean, isMmproj: boolean, mmprojPath: string|null }}
   */
  async detectVisionCapability(modelPath) {
    const basename = path.basename(modelPath, '.gguf');

    // mmproj ファイル自体か判定（名前ベース）
    if (MMPROJ_NAME_PATTERNS.some((p) => p.test(basename))) {
      return { isVision: false, isMmproj: true, mmprojPath: null };
    }

    // GGUF メタデータで architecture を確認
    try {
      const { readGgufFileInfo } = await import('node-llama-cpp');
      const info = await readGgufFileInfo(modelPath, { readTensorInfo: false });
      const arch = info?.metadata?.general?.architecture;
      if (arch === 'clip') {
        return { isVision: false, isMmproj: true, mmprojPath: null };
      }
    } catch {
      // メタデータ読み取り失敗は無視して名前ベースで判定
    }

    // ファイル名パターンで Vision モデルか判定
    const nameIndicatesVision = VISION_NAME_PATTERNS.some((p) => p.test(basename));

    // 同ディレクトリに mmproj ファイルがあるか確認
    const mmprojPath = await this.findMmprojForModel(modelPath);

    return {
      isVision: nameIndicatesVision || mmprojPath !== null,
      isMmproj: false,
      mmprojPath,
    };
  }

  /**
   * モデルに対応する mmproj ファイルを探す
   * 1) ファイル名パターン（mmproj / clip）でマッチ
   * 2) ヒットしない場合は全 .gguf を GGUF メタデータで確認（architecture === 'clip'）
   * @param {string} modelPath
   * @returns {string|null} mmproj ファイルパス
   */
  async findMmprojForModel(modelPath) {
    const dir = path.dirname(modelPath);
    const basename = path.basename(modelPath, '.gguf').toLowerCase();
    const self = path.basename(modelPath);

    try {
      const files = await fs.readdir(dir);
      const ggufFiles = files.filter((f) => f.endsWith('.gguf') && f !== self);

      // --- Step 1: 名前パターンで候補を絞る ---
      let candidates = ggufFiles.filter(
        (f) => MMPROJ_NAME_PATTERNS.some((p) => p.test(f))
      );

      // --- Step 2: 名前で見つからなければメタデータで clip を探す ---
      if (candidates.length === 0) {
        try {
          const { readGgufFileInfo } = await import('node-llama-cpp');
          for (const f of ggufFiles) {
            try {
              const info = await readGgufFileInfo(path.join(dir, f), { readTensorInfo: false });
              if (info?.metadata?.general?.architecture === 'clip') {
                candidates.push(f);
              }
            } catch {
              // 読み取れないファイルはスキップ
            }
          }
        } catch {
          // node-llama-cpp のインポート失敗はスキップ
        }
      }

      if (candidates.length === 0) return null;
      if (candidates.length === 1) return path.join(dir, candidates[0]);

      // 複数ある場合はベース名が近いものを優先
      const modelBase = basename.replace(/[-_]q\d.*$/i, '');
      const matched = candidates.find((f) => {
        const n = f.toLowerCase().replace('.gguf', '').replace(/[-_]mmproj.*$/, '');
        return n === modelBase || n.includes(modelBase) || modelBase.includes(n);
      });

      return path.join(dir, matched || candidates[0]);
    } catch {
      return null;
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
