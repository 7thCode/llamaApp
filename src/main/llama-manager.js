/**
 * Llama.cpp統合マネージャー
 * node-llama-cppを使用してモデルのロードと推論を管理
 */

const path = require('path');

// node-llama-cppのES Module対応
let llamaModule = null;

class LlamaManager {
  constructor() {
    this.llama = null;
    this.model = null;
    this.context = null;
    this.session = null;
    this.currentModelPath = null;
    this.isGenerating = false;
    this.initialized = false;
  }

  /**
   * node-llama-cppモジュールを初期化
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // 動的インポートでES Moduleを読み込む
      llamaModule = await import('node-llama-cpp');
      // getLlama()でLlamaインスタンスを取得
      this.llama = await llamaModule.getLlama();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize LlamaManager:', error);
      throw error;
    }
  }

  /**
   * モデルをロード
   * @param {string} modelPath - GGUFモデルファイルのパス
   */
  async loadModel(modelPath) {
    try {
      // 初期化チェック
      if (!this.initialized) {
        await this.initialize();
      }

      // 既存のモデルをアンロード
      if (this.model) {
        await this.unloadModel();
      }

      // モデルをロード (新API)
      this.model = await this.llama.loadModel({
        modelPath: modelPath,
      });

      // コンテキスト作成 (新API)
      this.context = await this.model.createContext({
        contextSize: 4096,
      });

      // セッション作成 (新API: contextSequence使用)
      this.session = new llamaModule.LlamaChatSession({
        contextSequence: this.context.getSequence(),
      });

      this.currentModelPath = modelPath;

      return {
        success: true,
        modelPath: path.basename(modelPath),
      };
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  }

  /**
   * モデルをアンロード
   */
  async unloadModel() {
    try {
      console.log('Unloading model...');

      // セッションをクリア
      if (this.session) {
        this.session = null;
      }

      // モデルをdisposeすると、関連するcontextも自動的にdisposeされる
      if (this.model) {
        await this.model.dispose();
        this.model = null;
        console.log('Model disposed');
      }

      // 念のためcontextもクリア
      if (this.context) {
        this.context = null;
      }

      this.currentModelPath = null;
    } catch (error) {
      console.error('Failed to unload model:', error);
      throw error;
    }
  }

  /**
   * テキスト生成（ストリーミング）
   * @param {string} prompt - ユーザー入力
   * @param {Function} onToken - トークンコールバック
   * @param {Object} options - 生成オプション
   */
  async generate(prompt, onToken, options = {}) {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    if (this.isGenerating) {
      throw new Error('Already generating');
    }

    try {
      this.isGenerating = true;
      let totalTokens = 0;
      let fullResponse = '';

      // 新API: onTextChunkコールバック使用
      const response = await this.session.prompt(prompt, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2048,
        onTextChunk: (chunk) => {
          fullResponse += chunk;
          totalTokens++;

          if (onToken) {
            onToken(chunk);
          }
        },
      });

      // レスポンスの確定
      const finalResponse = fullResponse || response || '';

      this.isGenerating = false;
      return {
        response: finalResponse,
        totalTokens: totalTokens || 1,
      };
    } catch (error) {
      console.error('Generation error:', error);
      this.isGenerating = false;
      throw error;
    }
  }

  /**
   * 生成を停止
   */
  stopGeneration() {
    // node-llama-cppは現在ストリーミング中断をサポートしていない
    // 将来的な実装のためのプレースホルダー
    this.isGenerating = false;
  }

  /**
   * モデルがロード済みかチェック
   */
  isModelLoaded() {
    return this.model !== null && this.session !== null;
  }

  /**
   * 現在のモデル情報を取得
   */
  getCurrentModelInfo() {
    if (!this.currentModelPath) {
      return null;
    }
    return {
      path: this.currentModelPath,
      name: path.basename(this.currentModelPath),
      loaded: this.isModelLoaded(),
    };
  }
}

module.exports = LlamaManager;
