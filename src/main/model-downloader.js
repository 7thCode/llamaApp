/**
 * HuggingFaceモデルダウンロード管理
 * ストリーミングダウンロード、プログレストラッキング、エラーハンドリング
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ModelDownloader {
  constructor(win, modelsDir) {
    this.win = win;
    this.modelsDir = modelsDir;
    this.activeDownloads = new Map();
  }

  /**
   * モデルのダウンロードを開始
   * @param {Object} modelConfig - プリセットモデルの設定
   * @returns {Promise<Object>} ダウンロード結果
   */
  async downloadModel(modelConfig) {
    const downloadId = crypto.randomUUID();
    const fileName = `${modelConfig.id}.gguf`;
    const tempPath = path.join(this.modelsDir, `${fileName}.part`);
    const finalPath = path.join(this.modelsDir, fileName);

    // 既にダウンロード済みかチェック
    if (fs.existsSync(finalPath)) {
      throw new Error('Model already downloaded');
    }

    // ディスク容量チェック
    try {
      const freeSpace = await this.getFreeDiskSpace();
      const requiredSpace = modelConfig.size * 1.2; // 20%バッファ

      if (freeSpace < requiredSpace) {
        throw new Error(
          `Insufficient disk space. Required: ${this.formatBytes(requiredSpace)}, Available: ${this.formatBytes(freeSpace)}`
        );
      }
    } catch (error) {
      console.warn('Could not check disk space:', error.message);
      // ディスク容量チェックに失敗してもダウンロードは続行
    }

    // ダウンロード状態を記録
    const downloadState = {
      id: downloadId,
      modelId: modelConfig.id,
      status: 'downloading',
      abortController: null,
    };
    this.activeDownloads.set(downloadId, downloadState);

    try {
      return await this._performDownload(downloadId, modelConfig, tempPath, finalPath);
    } catch (error) {
      // エラー時は一時ファイルを削除
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      this.activeDownloads.delete(downloadId);
      throw error;
    }
  }

  /**
   * 実際のダウンロード処理
   */
  _performDownload(downloadId, modelConfig, tempPath, finalPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      let downloadedBytes = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let totalBytes = 0;

      const downloadState = this.activeDownloads.get(downloadId);

      const request = https.get(modelConfig.downloadUrl, { timeout: 30000 }, (response) => {
        // リダイレクトの処理
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(tempPath);

          const redirectUrl = response.headers.location;
          modelConfig.downloadUrl = redirectUrl;

          // リダイレクト先で再試行
          this._performDownload(downloadId, modelConfig, tempPath, finalPath)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          reject(new Error(`Download failed with status code: ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'], 10);

        response.on('data', (chunk) => {
          // キャンセルチェック
          if (downloadState.status === 'cancelled') {
            request.destroy();
            response.destroy();
            file.close();
            fs.unlinkSync(tempPath);
            reject(new Error('Download cancelled by user'));
            return;
          }

          downloadedBytes += chunk.length;
          file.write(chunk);

          // プログレス更新（1秒ごと）
          const now = Date.now();
          if (now - lastTime >= 1000) {
            const timeDelta = (now - lastTime) / 1000;
            const bytesDelta = downloadedBytes - lastBytes;
            const speed = bytesDelta / timeDelta;
            const eta = speed > 0 ? (totalBytes - downloadedBytes) / speed : 0;
            const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

            this.win.webContents.send('download:progress', {
              downloadId,
              modelId: modelConfig.id,
              bytesDownloaded: downloadedBytes,
              totalBytes,
              percentage,
              speed,
              eta,
            });

            lastTime = now;
            lastBytes = downloadedBytes;
          }
        });

        response.on('end', () => {
          file.end(() => {
            // ファイルを最終的な場所に移動
            fs.renameSync(tempPath, finalPath);

            this.win.webContents.send('download:complete', {
              downloadId,
              modelId: modelConfig.id,
              filePath: finalPath,
            });

            this.activeDownloads.delete(downloadId);
            resolve({
              success: true,
              filePath: finalPath,
              downloadId,
            });
          });
        });

        response.on('error', (err) => {
          file.close();
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }

          this.win.webContents.send('download:error', {
            downloadId,
            modelId: modelConfig.id,
            error: err.message,
          });

          this.activeDownloads.delete(downloadId);
          reject(err);
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        this.win.webContents.send('download:error', {
          downloadId,
          modelId: modelConfig.id,
          error: err.message,
        });

        this.activeDownloads.delete(downloadId);
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        const error = new Error('Download timeout');
        this.win.webContents.send('download:error', {
          downloadId,
          modelId: modelConfig.id,
          error: error.message,
        });

        this.activeDownloads.delete(downloadId);
        reject(error);
      });
    });
  }

  /**
   * ダウンロードをキャンセル
   * @param {string} downloadId - ダウンロードID
   */
  cancelDownload(downloadId) {
    const downloadState = this.activeDownloads.get(downloadId);
    if (downloadState) {
      downloadState.status = 'cancelled';
      return { success: true };
    }
    return { success: false, error: 'Download not found' };
  }

  /**
   * アクティブなダウンロード一覧を取得
   * @returns {Array} ダウンロード状態の配列
   */
  listActiveDownloads() {
    const downloads = [];
    for (const [id, state] of this.activeDownloads.entries()) {
      downloads.push({
        downloadId: id,
        modelId: state.modelId,
        status: state.status,
      });
    }
    return downloads;
  }

  /**
   * 空きディスク容量を取得（macOS専用）
   * @returns {Promise<number>} 空き容量（バイト）
   */
  async getFreeDiskSpace() {
    try {
      // macOS: df -k コマンドで容量を取得
      const { stdout } = await execAsync('df -k ~ | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const availableKB = parseInt(parts[3], 10);
      return availableKB * 1024; // バイトに変換
    } catch (error) {
      console.error('Failed to get disk space:', error);
      // デフォルト値を返す（50GB）
      return 50 * 1024 * 1024 * 1024;
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
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = ModelDownloader;
