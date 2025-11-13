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

  // RAG管理
  RAG_ADD_URL: 'rag:addUrl',
  RAG_REMOVE_URL: 'rag:removeUrl',
  RAG_LIST_URLS: 'rag:listUrls',
  RAG_INDEX_URL: 'rag:indexUrl',
  RAG_ADD_FILE: 'rag:addFile',
  RAG_INDEX_FILE: 'rag:indexFile',
  RAG_SEARCH: 'rag:search',
  RAG_TOGGLE: 'rag:toggle',
  RAG_GET_STATUS: 'rag:getStatus',
  RAG_INDEX_PROGRESS: 'rag:indexProgress',
  RAG_INDEX_COMPLETE: 'rag:indexComplete',
  RAG_INDEX_ERROR: 'rag:indexError',

  // Agent管理
  AGENT_EXECUTE_TOOL: 'agent:executeTool',
  AGENT_GET_TOOLS: 'agent:getTools',
  AGENT_GET_HISTORY: 'agent:getHistory',
  AGENT_TOOL_START: 'agent:tool-start',
  AGENT_TOOL_COMPLETE: 'agent:tool-complete',
  AGENT_TOOL_ERROR: 'agent:tool-error',
  AGENT_TOGGLE: 'agent:toggle',
  AGENT_GET_STATUS: 'agent:getStatus',

  // 設定管理
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_LOAD: 'settings:load',
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

  // RAG操作
  addUrl: (url) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_ADD_URL, { url }),

  removeUrl: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_REMOVE_URL, { id }),

  listUrls: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_LIST_URLS),

  indexUrl: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_INDEX_URL, { id }),

  addFile: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_ADD_FILE, { filePath }),

  indexFile: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_INDEX_FILE, { id }),

  search: (query, limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_SEARCH, { query, limit }),

  toggleRag: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_TOGGLE, { enabled }),

  getRagStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RAG_GET_STATUS),

  onIndexProgress: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.RAG_INDEX_PROGRESS, (event, data) => callback(data)),

  onIndexComplete: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.RAG_INDEX_COMPLETE, (event, data) => callback(data)),

  onIndexError: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.RAG_INDEX_ERROR, (event, data) => callback(data)),

  // Agent操作
  executeTool: (tool, args) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_EXECUTE_TOOL, { tool, arguments: args }),

  getTools: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_TOOLS),

  getHistory: (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_HISTORY, { limit }),

  toggleAgent: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_TOGGLE, { enabled }),

  getAgentStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_STATUS),

  onToolStart: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.AGENT_TOOL_START, (event, data) => callback(data)),

  onToolComplete: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.AGENT_TOOL_COMPLETE, (event, data) => callback(data)),

  onToolError: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.AGENT_TOOL_ERROR, (event, data) => callback(data)),
});

// 設定API
contextBridge.exposeInMainWorld('electronAPI', {
  settings: {
    save: (settings) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),
    load: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD),
  },
});
