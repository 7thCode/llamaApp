/**
 * プリロードスクリプト
 * セキュアなAPIをレンダラープロセスに公開
 */

const { contextBridge, ipcRenderer } = require('electron');

// IPC チャンネル名（constants.jsから直接コピー）
const IPC_CHANNELS = {
  // Llama操作
  LLAMA_GENERATE: 'llama:generate',
  LLAMA_STOP: 'llama:stop',
  LLAMA_TOKEN: 'llama:token',
  LLAMA_DONE: 'llama:done',
  LLAMA_ERROR: 'llama:error',

  // モデル管理
  MODEL_LIST: 'model:list',
  MODEL_SWITCH: 'model:switch',
  MODEL_ADD: 'model:add',
  MODEL_DELETE: 'model:delete',

  // モデルダウンロード
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_PRESET_MODELS: 'download:preset-models',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_COMPLETE: 'download:complete',
  DOWNLOAD_ERROR: 'download:error',

  // 会話管理
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_LOAD: 'conversation:load',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_DELETE: 'conversation:delete',
};

// セキュアなAPIをwindow.llamaAPIとして公開
contextBridge.exposeInMainWorld('llamaAPI', {
  // Llama操作
  generate: (prompt, systemPrompt, conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLAMA_GENERATE, {
      prompt,
      systemPrompt,
      conversationId
    }),

  onToken: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_TOKEN, (event, data) => callback(data)),

  onDone: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_DONE, (event, data) => callback(data)),

  onError: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.LLAMA_ERROR, (event, data) => callback(data)),

  // モデル管理
  listModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),

  switchModel: (modelPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_SWITCH, { modelPath }),

  addModel: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_ADD),

  deleteModel: (modelId) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_DELETE, { modelId }),

  // モデルダウンロード
  getPresetModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_PRESET_MODELS),

  startDownload: (modelId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, { modelId }),

  cancelDownload: (downloadId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, { downloadId }),

  listDownloads: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_LIST),

  onDownloadProgress: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, (event, data) => callback(data)),

  onDownloadComplete: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_COMPLETE, (event, data) => callback(data)),

  onDownloadError: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_ERROR, (event, data) => callback(data)),

  // 会話管理（将来の実装用）
  listConversations: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST),

  loadConversation: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD, { id }),

  createConversation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE),

  deleteConversation: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, { id }),
});
