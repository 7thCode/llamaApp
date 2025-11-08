/**
 * Electronメインプロセス
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const LlamaManager = require('./llama-manager');
const ModelManager = require('./model-manager');
const ModelDownloader = require('./model-downloader');
const { IPC_CHANNELS } = require('../shared/constants');

let mainWindow;
let llamaManager;
let modelManager;
let modelDownloader;

/**
 * メインウィンドウを作成
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 開発時はDevToolsを開く
  if (process.argv.includes('--inspect')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', async (event) => {
    // macOS以外ではウィンドウ閉じる=アプリ終了なので、クリーンアップを待つ
    if (process.platform !== 'darwin' && !isQuitting) {
      event.preventDefault();
      isQuitting = true;

      try {
        if (llamaManager) {
          await llamaManager.unloadModel();
        }
      } catch (error) {
        console.error('Error during window close cleanup:', error);
      } finally {
        mainWindow.destroy();
        app.quit();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * アプリケーション初期化
 */
async function initializeApp() {
  // LlamaManager、ModelManager、ModelDownloaderの初期化
  llamaManager = new LlamaManager();
  modelManager = new ModelManager();

  try {
    // LlamaManagerの初期化（ES Moduleの動的インポート）
    await llamaManager.initialize();
    // ModelManagerの初期化
    await modelManager.initialize();
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

/**
 * IPCハンドラーの設定
 */
function setupIpcHandlers() {
  // Llama生成
  ipcMain.handle(IPC_CHANNELS.LLAMA_GENERATE, async (event, { prompt, systemPrompt, conversationId }) => {
    try {
      if (!llamaManager.isModelLoaded()) {
        throw new Error('No model loaded. Please load a model first.');
      }

      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`
        : prompt;

      const result = await llamaManager.generate(
        fullPrompt,
        (token) => {
          // ストリーミングトークンをレンダラーに送信
          mainWindow.webContents.send(IPC_CHANNELS.LLAMA_TOKEN, {
            token,
            conversationId,
          });
        }
      );

      // 生成完了を通知
      mainWindow.webContents.send(IPC_CHANNELS.LLAMA_DONE, {
        totalTokens: result.totalTokens,
        conversationId,
      });

      return { success: true };
    } catch (error) {
      console.error('Generation error:', error);
      mainWindow.webContents.send(IPC_CHANNELS.LLAMA_ERROR, {
        error: error.message,
        conversationId,
      });
      throw error;
    }
  });

  // モデル一覧取得
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    try {
      const models = await modelManager.listModels();
      const currentModel = llamaManager.getCurrentModelInfo();
      return {
        models,
        currentModel,
      };
    } catch (error) {
      console.error('Failed to list models:', error);
      throw error;
    }
  });

  // モデル切り替え
  ipcMain.handle(IPC_CHANNELS.MODEL_SWITCH, async (event, { modelPath }) => {
    try {
      const result = await llamaManager.loadModel(modelPath);
      return result;
    } catch (error) {
      console.error('Failed to switch model:', error);
      throw error;
    }
  });

  // モデル追加
  ipcMain.handle(IPC_CHANNELS.MODEL_ADD, async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select GGUF Model File',
        filters: [
          { name: 'GGUF Models', extensions: ['gguf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const modelInfo = await modelManager.addModel(result.filePaths[0]);
      return { success: true, model: modelInfo };
    } catch (error) {
      console.error('Failed to add model:', error);
      throw error;
    }
  });

  // モデル削除
  ipcMain.handle(IPC_CHANNELS.MODEL_DELETE, async (event, { modelId }) => {
    try {
      await modelManager.deleteModel(modelId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw error;
    }
  });

  // プリセットモデル一覧取得
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_PRESET_MODELS, async () => {
    try {
      const presetPath = path.join(__dirname, '../shared/preset-models.json');
      const data = await fs.readFile(presetPath, 'utf-8');
      const presetModels = JSON.parse(data);
      return presetModels.models;
    } catch (error) {
      console.error('Failed to load preset models:', error);
      throw error;
    }
  });

  // モデルダウンロード開始
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START, async (event, { modelId }) => {
    try {
      // プリセットモデルを読み込み
      const presetPath = path.join(__dirname, '../shared/preset-models.json');
      const data = await fs.readFile(presetPath, 'utf-8');
      const presetModels = JSON.parse(data);

      const modelConfig = presetModels.models.find(m => m.id === modelId);
      if (!modelConfig) {
        throw new Error('Model not found in preset list');
      }

      // ModelDownloaderの初期化（遅延初期化）
      if (!modelDownloader) {
        const { MODELS_DIR } = require('../shared/constants');
        modelDownloader = new ModelDownloader(mainWindow, MODELS_DIR);
      }

      const result = await modelDownloader.downloadModel(modelConfig);
      return result;
    } catch (error) {
      console.error('Failed to start download:', error);
      throw error;
    }
  });

  // ダウンロードキャンセル
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, async (event, { downloadId }) => {
    try {
      if (!modelDownloader) {
        return { success: false, error: 'No active downloads' };
      }
      return modelDownloader.cancelDownload(downloadId);
    } catch (error) {
      console.error('Failed to cancel download:', error);
      throw error;
    }
  });

  // アクティブなダウンロード一覧取得
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_LIST, async () => {
    try {
      if (!modelDownloader) {
        return [];
      }
      return modelDownloader.listActiveDownloads();
    } catch (error) {
      console.error('Failed to list downloads:', error);
      throw error;
    }
  });
}

// アプリケーション起動
app.whenReady().then(async () => {
  await initializeApp();
  setupIpcHandlers();
  createWindow();
});

// すべてのウィンドウが閉じられた時
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アクティベート時
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// アプリ終了時のクリーンアップ
let isQuitting = false;

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;

    console.log('Cleaning up before quit...');

    try {
      if (llamaManager) {
        await llamaManager.unloadModel();
        console.log('Model unloaded successfully');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      // クリーンアップ完了後に終了
      app.quit();
    }
  }
});
