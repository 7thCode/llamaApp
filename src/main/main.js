/**
 * Electronメインプロセス
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const LlamaManager = require('./llama-manager');
const ModelManager = require('./model-manager');
const ModelDownloader = require('./model-downloader');
const RagManager = require('./rag-manager');
const AgentController = require('./agent/agent-controller');
const ConversationManager = require('./conversation-manager');
const { searchHuggingFaceModels } = require('./hf-search');
const { IPC_CHANNELS, DB_DIR, DEFAULT_SETTINGS } = require('../shared/constants');

// 設定ファイルのパス
const SETTINGS_PATH = path.join(DB_DIR, 'settings.json');

let mainWindow;
let llamaManager;
let modelManager;
let modelDownloader;
let ragManager;
let agentController;
let conversationManager;
let activeConversationId = null;

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
        process.exit(0);
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
  try {
    // 設定ファイルから保存されたモデルディレクトリを読み込み
    let modelsDirectory = null;
    try {
      await fs.access(SETTINGS_PATH);
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(data);
      modelsDirectory = settings.modelsDirectory;
      console.log('Loaded models directory from settings:', modelsDirectory);
    } catch {
      console.log('No saved models directory, using default');
    }

    // LlamaManager、ModelManagerの初期化
    llamaManager = new LlamaManager();
    modelManager = new ModelManager(modelsDirectory);

    // ConversationManagerの初期化
    conversationManager = new ConversationManager();
    conversationManager.initialize();

    // ログディレクトリを事前に作成（llama-manager のログが確実に書き込まれるよう）
    try {
      await fs.mkdir(path.join(app.getPath('userData')), { recursive: true });
    } catch (_) {}

    // LlamaManagerの初期化（ES Moduleの動的インポート）
    await llamaManager.initialize();
    // ModelManagerの初期化（ディレクトリ作成）
    await modelManager.initialize();
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

/**
 * Agent初期化（ウィンドウ作成後）
 */
function initializeAgent() {
  try {
    agentController = new AgentController(mainWindow);
    // LlamaManagerにエージェント機能を統合
    llamaManager.enableAgent(agentController);
    console.log('Agent Controller initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Agent Controller:', error);
    console.error('Agent features will be unavailable');
    agentController = null;
  }
}

/**
 * RAG初期化（ウィンドウ作成後）
 */
function initializeRag() {
  try {
    ragManager = new RagManager(mainWindow);
    ragManager.initialize();
    console.log('RAG Manager initialized successfully');
  } catch (error) {
    console.error('Failed to initialize RAG Manager:', error);
    console.error('RAG features will be unavailable');
    ragManager = null; // エラー時はnullに設定
  }
}

/**
 * IPCハンドラーの設定
 */
function setupIpcHandlers() {
  // LLM生成停止
  ipcMain.handle(IPC_CHANNELS.LLAMA_STOP, () => {
    llamaManager.stopGeneration();
    return { success: true };
  });

  // LLMテキスト生成
  ipcMain.handle(IPC_CHANNELS.LLAMA_GENERATE, async (event, { prompt, systemPrompt, conversationId, temperature, maxTokens }) => {
    try {
      if (!llamaManager.isModelLoaded()) {
        throw new Error('No model loaded. Please load a model first.');
      }

      // システムプロンプトが指定されている場合は適用
      if (systemPrompt) {
        let finalSystemPrompt = systemPrompt;

        // エージェント有効時はツール定義を含むシステムプロンプトを構築
        if (llamaManager.isAgentEnabled()) {
          finalSystemPrompt = llamaManager._buildSystemPromptWithTools(systemPrompt);
        }

        await llamaManager.setSystemPrompt(finalSystemPrompt);
      }

      // ユーザーメッセージをDBに保存
      if (conversationId && conversationManager) {
        conversationManager.saveMessage(conversationId, 'user', prompt);
        // 最初のメッセージから会話タイトルを自動生成
        const data = conversationManager.loadConversation(conversationId);
        if (data && data.messages.length === 1) {
          const autoTitle = prompt.replace(/\n/g, ' ').trim().substring(0, 40);
          conversationManager.updateTitle(conversationId, autoTitle);
        }
      }

      // RAG拡張プロンプト生成
      let enhancedPrompt = prompt;
      if (ragManager) {
        enhancedPrompt = await ragManager.augmentPrompt(prompt, prompt);
      }

      // エージェント有効時はgenerateWithAgent()を使用
      const generateMethod = llamaManager.isAgentEnabled()
        ? llamaManager.generateWithAgent.bind(llamaManager)
        : llamaManager.generate.bind(llamaManager);

      const result = await generateMethod(
        enhancedPrompt,
        (token) => {
          // ストリーミングトークンをレンダラーに送信
          event.sender.send(IPC_CHANNELS.LLAMA_TOKEN, {
            token,
            conversationId,
          });
        },
        {
          temperature: temperature,
          maxTokens: maxTokens
        }
      );

      // アシスタント応答をDBに保存（中断時は保存しない）
      if (conversationId && conversationManager && result.response && !result.aborted) {
        conversationManager.saveMessage(conversationId, 'assistant', result.response);
      }

      // 生成完了を通知
      event.sender.send(IPC_CHANNELS.LLAMA_DONE, {
        totalTokens: result.totalTokens,
        conversationId,
      });

      return { success: true };
    } catch (error) {
      console.error('Generation error:', error);
      event.sender.send(IPC_CHANNELS.LLAMA_ERROR, {
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
    const logPath = path.join(app.getPath('userData'), 'model-load.log');
    const logLine = (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      fsSync.appendFileSync(logPath, line);
      console.log(msg);
    };

    try {
      logLine(`Loading model: ${path.basename(modelPath)}`);
      const result = await llamaManager.loadModel(modelPath);
      logLine(`Model loaded successfully: ${path.basename(modelPath)}`);

      // モデルロード後、保存された設定からシステムプロンプトを適用
      try {
        await fs.access(SETTINGS_PATH);
        const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
        const settings = JSON.parse(data);
        if (settings.systemPrompt) {
          await llamaManager.setSystemPrompt(settings.systemPrompt);
          console.log('Applied saved system prompt after model load');
        }
      } catch (error) {
        // 設定ファイルがない場合はデフォルトのシステムプロンプトを使用
        console.log('No saved settings, using default system prompt');
      }

      // アクティブな会話の履歴をLLMセッションに復元
      if (activeConversationId && conversationManager) {
        const convData = conversationManager.loadConversation(activeConversationId);
        if (convData && convData.messages.length > 0) {
          llamaManager.restoreHistory(convData.messages);
          console.log(`Restored history for conversation: ${activeConversationId}`);
        }
      }

      return result;
    } catch (error) {
      logLine(`ERROR loading model: ${path.basename(modelPath)}`);
      logLine(`  message: ${error.message}`);
      logLine(`  stack: ${error.stack}`);
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
        const modelsDir = modelManager.getModelsDirectory();
        modelDownloader = new ModelDownloader(mainWindow, modelsDir);
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

  // === RAG管理 ===

  // URL追加
  ipcMain.handle(IPC_CHANNELS.RAG_ADD_URL, async (event, { url }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return ragManager.addUrl(url);
    } catch (error) {
      console.error('Failed to add URL:', error);
      throw error;
    }
  });

  // URL削除
  ipcMain.handle(IPC_CHANNELS.RAG_REMOVE_URL, async (event, { id }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      ragManager.removeUrl(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to remove URL:', error);
      throw error;
    }
  });

  // URL一覧取得
  ipcMain.handle(IPC_CHANNELS.RAG_LIST_URLS, async () => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return ragManager.listUrls();
    } catch (error) {
      console.error('Failed to list URLs:', error);
      throw error;
    }
  });

  // URLインデックス化
  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_URL, async (event, { id }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return await ragManager.indexUrl(id);
    } catch (error) {
      console.error('Failed to index URL:', error);
      throw error;
    }
  });

  // ファイル追加
  ipcMain.handle(IPC_CHANNELS.RAG_ADD_FILE, async (event, { filePath }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return ragManager.addFile(filePath);
    } catch (error) {
      console.error('Failed to add file:', error);
      throw error;
    }
  });

  // ファイルインデックス化
  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_FILE, async (event, { id }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return await ragManager.indexFile(id);
    } catch (error) {
      console.error('Failed to index file:', error);
      throw error;
    }
  });

  // 検索
  ipcMain.handle(IPC_CHANNELS.RAG_SEARCH, async (event, { query, limit }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return ragManager.search(query, limit);
    } catch (error) {
      console.error('Failed to search:', error);
      throw error;
    }
  });

  // RAG有効/無効切り替え
  ipcMain.handle(IPC_CHANNELS.RAG_TOGGLE, async (event, { enabled }) => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      ragManager.toggleRag(enabled);
      return { success: true, enabled };
    } catch (error) {
      console.error('Failed to toggle RAG:', error);
      throw error;
    }
  });

  // RAG状態取得
  ipcMain.handle(IPC_CHANNELS.RAG_GET_STATUS, async () => {
    try {
      if (!ragManager) {
        throw new Error('RAG Manager not initialized');
      }
      return ragManager.getStatus();
    } catch (error) {
      console.error('Failed to get RAG status:', error);
      throw error;
    }
  });

  // === Agent管理 ===

  // Agent有効/無効切り替え
  ipcMain.handle(IPC_CHANNELS.AGENT_TOGGLE, async (event, { enabled }) => {
    try {
      if (!llamaManager) {
        throw new Error('Llama Manager not initialized');
      }

      if (enabled) {
        if (!agentController) {
          throw new Error('Agent Controller not initialized');
        }
        llamaManager.enableAgent(agentController);
      } else {
        llamaManager.disableAgent();
      }

      return { success: true, enabled };
    } catch (error) {
      console.error('Failed to toggle agent:', error);
      throw error;
    }
  });

  // Agent状態取得
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_STATUS, async () => {
    try {
      if (!llamaManager) {
        throw new Error('Llama Manager not initialized');
      }

      return {
        enabled: llamaManager.isAgentEnabled(),
        available: agentController !== null
      };
    } catch (error) {
      console.error('Failed to get agent status:', error);
      throw error;
    }
  });

  // ツール定義取得
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_TOOLS, async () => {
    try {
      if (!agentController) {
        throw new Error('Agent Controller not initialized');
      }

      return agentController.getToolDefinitions();
    } catch (error) {
      console.error('Failed to get tools:', error);
      throw error;
    }
  });

  // 実行履歴取得
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_HISTORY, async (event, { limit }) => {
    try {
      if (!agentController) {
        throw new Error('Agent Controller not initialized');
      }

      return agentController.getExecutionHistory(limit || 50);
    } catch (error) {
      console.error('Failed to get execution history:', error);
      throw error;
    }
  });

  // ツール直接実行（デバッグ用）
  ipcMain.handle(IPC_CHANNELS.AGENT_EXECUTE_TOOL, async (event, { tool, arguments: args }) => {
    try {
      if (!agentController) {
        throw new Error('Agent Controller not initialized');
      }

      return await agentController.executeToolCall({ tool, arguments: args });
    } catch (error) {
      console.error('Failed to execute tool:', error);
      throw error;
    }
  });

  // === 設定管理 ===

  // 設定を保存
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (event, settings) => {
    try {
      // DB_DIRが存在しない場合は作成
      await fs.mkdir(DB_DIR, { recursive: true });

      // 設定をJSON形式で保存
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
      console.log('Settings saved:', settings);

      // システムプロンプトが変更された場合、LlamaManagerに適用
      if (settings.systemPrompt && llamaManager.isModelLoaded()) {
        await llamaManager.setSystemPrompt(settings.systemPrompt);
        console.log('System prompt updated in LlamaManager');
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  });

  // 設定を読み込み
  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD, async () => {
    try {
      // 設定ファイルが存在しない場合はデフォルト設定を返す
      try {
        await fs.access(SETTINGS_PATH);
      } catch {
        console.log('Settings file not found, using defaults');
        return DEFAULT_SETTINGS;
      }

      // 設定ファイルを読み込み
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(data);
      console.log('Settings loaded:', settings);

      // デフォルト値とマージ（新しい設定項目が追加された場合に対応）
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      // エラーの場合はデフォルト設定を返す
      return DEFAULT_SETTINGS;
    }
  });

  // モデルディレクトリ選択ダイアログ
  ipcMain.handle(IPC_CHANNELS.MODELS_DIR_SELECT, async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'モデル保存ディレクトリを選択',
        defaultPath: modelManager.getModelsDirectory(),
        properties: ['openDirectory', 'createDirectory'],
        message: 'GGUFモデルファイルを保存するディレクトリを選択してください',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      console.error('Failed to select models directory:', error);
      throw error;
    }
  });

  // モデルディレクトリを取得
  ipcMain.handle(IPC_CHANNELS.MODELS_DIR_GET, async () => {
    try {
      return {
        success: true,
        path: modelManager.getModelsDirectory(),
      };
    } catch (error) {
      console.error('Failed to get models directory:', error);
      throw error;
    }
  });

  // モデルディレクトリを設定
  ipcMain.handle(IPC_CHANNELS.MODELS_DIR_SET, async (event, { dirPath }) => {
    try {
      // ディレクトリの存在確認
      await fs.access(dirPath);

      // ModelManagerとModelDownloaderのディレクトリを更新
      modelManager.setModelsDirectory(dirPath);
      if (modelDownloader) {
        modelDownloader.setModelsDirectory(dirPath);
      }

      // 設定に保存
      let settings = DEFAULT_SETTINGS;
      try {
        const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
        settings = { ...settings, ...JSON.parse(data) };
      } catch {
        // 設定ファイルが存在しない場合はデフォルト値を使用
      }

      settings.modelsDirectory = dirPath;
      await fs.mkdir(DB_DIR, { recursive: true });
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');

      console.log('Models directory updated:', dirPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to set models directory:', error);
      throw error;
    }
  });
  // === 会話管理 ===

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, () => {
    if (!conversationManager) return [];
    return conversationManager.listConversations();
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE, () => {
    if (!conversationManager) throw new Error('ConversationManager not initialized');
    const conv = conversationManager.createConversation();
    activeConversationId = conv.id;
    return conv;
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD, (event, { id }) => {
    if (!conversationManager) throw new Error('ConversationManager not initialized');
    const result = conversationManager.loadConversation(id);
    if (!result) throw new Error('Conversation not found');

    activeConversationId = id;

    // LLMセッションに履歴を復元（モデルがロード済みの場合のみ）
    if (llamaManager.isModelLoaded()) {
      llamaManager.restoreHistory(result.messages);
    }

    return result;
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (event, { id }) => {
    if (!conversationManager) throw new Error('ConversationManager not initialized');
    conversationManager.deleteConversation(id);
    if (activeConversationId === id) {
      activeConversationId = null;
    }
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_RENAME, (event, { id, title }) => {
    if (!conversationManager) throw new Error('ConversationManager not initialized');
    conversationManager.updateTitle(id, title.trim() || '新しい会話');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE_LAST_MESSAGE, (event, { conversationId }) => {
    if (!conversationManager) throw new Error('ConversationManager not initialized');
    conversationManager.deleteLastMessage(conversationId);
    return { success: true };
  });

  // === HuggingFace 検索 ===

  // HFモデル検索
  ipcMain.handle(IPC_CHANNELS.HF_SEARCH_MODELS, async (event, searchOptions) => {
    try {
      // 設定ファイルからHF_TOKENを読み取る
      let hfToken = '';
      try {
        const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
        const settings = JSON.parse(data);
        hfToken = settings.hfToken || '';
      } catch {
        // 設定ファイルなし
      }

      const models = await searchHuggingFaceModels({
        ...searchOptions,
        hfToken,
      });
      return { success: true, models };
    } catch (error) {
      console.error('Failed to search HuggingFace models:', error);
      return { success: false, error: error.message, models: [] };
    }
  });

  // HFモデルを直接ダウンロード（URLを模側にダウンロード）
  ipcMain.handle(IPC_CHANNELS.HF_DOWNLOAD_MODEL, async (event, { hfModel }) => {
    try {
      if (!hfModel || !hfModel.downloadUrl) {
        throw new Error('Invalid model data: missing downloadUrl');
      }

      // ModelDownloaderの初期化（遅延初期化）
      if (!modelDownloader) {
        const modelsDir = modelManager.getModelsDirectory();
        modelDownloader = new ModelDownloader(mainWindow, modelsDir);
      }

      // hfModelをプリセットモデル形式に合わせてダウンロード
      const modelConfig = {
        id: hfModel.id,
        name: hfModel.name,
        downloadUrl: hfModel.downloadUrl,
        size: hfModel.size || 0,
      };

      const result = await modelDownloader.downloadModel(modelConfig);
      return result;
    } catch (error) {
      console.error('Failed to download HuggingFace model:', error);
      throw error;
    }
  });

}

// アプリケーション起動
app.whenReady().then(async () => {
  await initializeApp();
  createWindow();
  initializeAgent(); // ウィンドウ作成後にAgent初期化
  initializeRag(); // ウィンドウ作成後にRAG初期化
  setupIpcHandlers();
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
    initializeAgent(); // ウィンドウ再作成時にAgentも再初期化
    initializeRag(); // ウィンドウ再作成時にRAGも再初期化
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
      if (ragManager) {
        ragManager.close();
        console.log('RAG Manager closed successfully');
      }
      if (conversationManager) {
        conversationManager.close();
        console.log('Conversation Manager closed successfully');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      // クリーンアップ完了後、process.exit()で確実に終了
      process.exit(0);
    }
  }
});
